"use client";

import { useState } from "react";
import Link from "@/components/link";

type RequestsData = {
  trialRequests: { id: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; status: string; tenantId: string | null; createdAt: string }[];
  quoteRequests: { id: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; planKey: string | null; planLabel: string | null; note: string | null; status: string; createdAt: string }[];
  purchaseRequests: { id: string; planKey: string; planLabel: string; interval: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; status: string; tenantId: string | null; createdAt: string }[];
  pendingOrders: { id: string; planKey: string; planLabel: string; interval: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; status: string; subscriptionId: string | null; expiresAt: string; createdAt: string; updatedAt: string }[];
};

const REQUEST_STATUS_TR: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  contacted: "İletişime geçildi",
  closed: "Kapatıldı",
};

const PENDING_STATUS_TR: Record<string, string> = {
  awaiting_payment: "Ödeme bekliyor",
  paid: "Ödendi",
  expired: "Süresi doldu",
  canceled: "İptal edildi",
};

const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const linkCls = "text-[var(--color-primary)] hover:underline";

function MailCell({ email }: { email: string }) {
  return <a className={linkCls} href={`mailto:${email}`}>{email}</a>;
}

function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-[var(--color-text-muted)]">—</span>;
  return <a className={linkCls} href={`tel:${phone.replace(/\s+/g, "")}`}>{phone}</a>;
}

/** Başvurular ve teklif talepleri — abonelik listesinden ayrı ekran. */
export function RequestsManager({ data }: { data: RequestsData }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pendingQuery, setPendingQuery] = useState("");
  const [pendingStatus, setPendingStatus] = useState("");
  const q = pendingQuery.trim().toLocaleLowerCase("tr");
  const pendingRows = (data.pendingOrders ?? []).filter(
    (r) =>
      (!pendingStatus || r.status === pendingStatus) &&
      (!q ||
        r.institutionName.toLocaleLowerCase("tr").includes(q) ||
        r.ownerName.toLocaleLowerCase("tr").includes(q) ||
        r.ownerEmail.toLocaleLowerCase("tr").includes(q) ||
        r.planLabel.toLocaleLowerCase("tr").includes(q))
  );

  async function post(path: string, body: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { ok: boolean; data?: unknown; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "İşlem başarısız." });
        return null;
      }
      setNotice({ kind: "ok", text: "İşlem tamamlandı." });
      return json.data;
    } catch {
      setBusy(false);
      setNotice({ kind: "error", text: "Bağlantı hatası." });
      return null;
    }
  }

  const refresh = () => window.location.reload();
  const btn = "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60";
  const btnGhost = "rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60";

  return (
    <div className="space-y-6">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-[var(--radius-md)] px-4 py-2.5 text-sm border ${notice.kind === "error" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]" : "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]"}`}>
          {notice.text}
        </p>
      ) : null}

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Satın alma başvuruları ({data.purchaseRequests.length})</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Yeni müşterinin satın alma başvurusu. Onay ödeme başlatmaz; kurum daveti ve giriş sonrası satın almaya devam edilir.</p>
        {data.purchaseRequests.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Bekleyen başvuru yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Sahip</th>
                  <th className="py-2 pr-2 font-medium">E-posta</th>
                  <th className="py-2 pr-2 font-medium">Telefon</th>
                  <th className="py-2 pr-2 font-medium">Seçtiği paket</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.purchaseRequests.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-2">{r.institutionName}</td>
                    <td className="py-2 pr-2">{r.ownerName}</td>
                    <td className="py-2 pr-2"><MailCell email={r.ownerEmail} /></td>
                    <td className="py-2 pr-2"><PhoneCell phone={r.ownerPhone} /></td>
                    <td className="py-2 pr-2">{r.planLabel} ({r.interval === "yearly" ? "yıllık" : "aylık"})</td>
                    <td className="py-2 pr-2" title={r.status}>{REQUEST_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2">
                      <span className="flex items-center gap-1">
                        <Link className={btnGhost} href={`/platform/basvurular/satin-alma/${r.id}`}>İncele</Link>
                        {r.status === "pending" ? (
                        <span className="flex gap-1">
                          <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "purchase_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>Onayla</button>
                          <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "purchase_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Reddet</button>
                        </span>
                      ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Deneme başvuruları ({data.trialRequests.length})</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Onaylanan başvuru için güvenli kurum daveti gönderilir; kurum açılınca deneme başlatılır.</p>
        {data.trialRequests.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Bekleyen başvuru yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Sahip</th>
                  <th className="py-2 pr-2 font-medium">E-posta</th>
                  <th className="py-2 pr-2 font-medium">Telefon</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.trialRequests.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-2">{r.institutionName}</td>
                    <td className="py-2 pr-2">{r.ownerName}</td>
                    <td className="py-2 pr-2"><MailCell email={r.ownerEmail} /></td>
                    <td className="py-2 pr-2"><PhoneCell phone={r.ownerPhone} /></td>
                    <td className="py-2 pr-2" title={r.status}>{REQUEST_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2">
                      <span className="flex items-center gap-1">
                        <Link className={btnGhost} href={`/platform/basvurular/deneme/${r.id}`}>İncele</Link>
                        {r.status === "pending" ? (
                          <span className="flex gap-1">
                            <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "trial_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>Onayla</button>
                            <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "trial_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Reddet</button>
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Teklif istekleri ({data.quoteRequests.length})</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">İstek abonelik açmaz; kurumla iletişime geçilip teklif ve davet yolu işletilir.</p>
        {data.quoteRequests.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Bekleyen istek yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Sahip</th>
                  <th className="py-2 pr-2 font-medium">E-posta</th>
                  <th className="py-2 pr-2 font-medium">Telefon</th>
                  <th className="py-2 pr-2 font-medium">Plan</th>
                  <th className="py-2 pr-2 font-medium">Not</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.quoteRequests.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-2">{r.institutionName}</td>
                    <td className="py-2 pr-2">{r.ownerName}</td>
                    <td className="py-2 pr-2"><MailCell email={r.ownerEmail} /></td>
                    <td className="py-2 pr-2"><PhoneCell phone={r.ownerPhone} /></td>
                    <td className="py-2 pr-2" title={r.planKey ?? undefined}>{r.planLabel ?? "—"}</td>
                    <td className="py-2 pr-2">{r.note ?? "—"}</td>
                    <td className="py-2 pr-2" title={r.status}>{REQUEST_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2">
                      <span className="flex items-center gap-1">
                        <Link className={btnGhost} href={`/platform/basvurular/teklif/${r.id}`}>İncele</Link>
                        {r.status === "pending" ? (
                          <span className="flex gap-1">
                            <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "quote_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>İletişime geçildi</button>
                            <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "quote_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Kapat</button>
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Tamamlanmamış işlemler — satın alma taslakları ({pendingRows.length})</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Kayıt oluşturulmuş ama ödemesi tamamlanmamış satın almalar (kurum açılmamış olabilir).
          Geçici kayıttır — aktif müşteri sayısına eklenmez.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={pendingQuery}
            onChange={(e) => setPendingQuery(e.target.value)}
            placeholder="Kurum, sahip, e-posta veya paket ara…"
            aria-label="Taslak ara"
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)]"
          />
          <select
            value={pendingStatus}
            onChange={(e) => setPendingStatus(e.target.value)}
            aria-label="Duruma göre süz"
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)]"
          >
            <option value="">Tüm durumlar</option>
            <option value="awaiting_payment">Ödeme bekliyor</option>
            <option value="paid">Ödendi</option>
            <option value="expired">Süresi doldu</option>
            <option value="canceled">İptal edildi</option>
          </select>
        </div>
        {pendingRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            {(data.pendingOrders ?? []).length === 0 ? "Kayıtlı taslak yok." : "Aramaya uyan taslak yok."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Sahip</th>
                  <th className="py-2 pr-2 font-medium">E-posta</th>
                  <th className="py-2 pr-2 font-medium">Telefon</th>
                  <th className="py-2 pr-2 font-medium">Paket</th>
                  <th className="py-2 pr-2 font-medium">Aşama</th>
                  <th className="py-2 pr-2 font-medium">Ödeme</th>
                  <th className="py-2 pr-2 font-medium">Oluşturma</th>
                  <th className="py-2 pr-2 font-medium">Son işlem</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-2">{r.institutionName}</td>
                    <td className="py-2 pr-2">{r.ownerName}</td>
                    <td className="py-2 pr-2"><MailCell email={r.ownerEmail} /></td>
                    <td className="py-2 pr-2"><PhoneCell phone={r.ownerPhone} /></td>
                    <td className="py-2 pr-2" title={r.planKey}>{r.planLabel} ({r.interval === "yearly" ? "yıllık" : "aylık"})</td>
                    <td className="py-2 pr-2" title={r.status}>{PENDING_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2 pr-2">{r.status === "paid" ? "Ödendi" : r.subscriptionId ? "Bağlı abonelik var" : "—"}</td>
                    <td className="py-2 pr-2">{fmtDateTime(r.createdAt)}</td>
                    <td className="py-2 pr-2">{fmtDateTime(r.updatedAt)}</td>
                    <td className="py-2"><Link className={btnGhost} href={`/platform/basvurular/taslak/${r.id}`}>İncele</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
