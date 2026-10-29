"use client";

import { useState } from "react";

type RequestsData = {
  trialRequests: { id: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; status: string; tenantId: string | null; createdAt: string }[];
  quoteRequests: { id: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; planKey: string | null; planLabel: string | null; note: string | null; status: string; createdAt: string }[];
  purchaseRequests: { id: string; planKey: string; planLabel: string; interval: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; status: string; tenantId: string | null; createdAt: string }[];
};

const REQUEST_STATUS_TR: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  contacted: "İletişime geçildi",
  closed: "Kapatıldı",
};

/** Başvurular ve teklif talepleri — abonelik listesinden ayrı ekran. */
export function RequestsManager({ data }: { data: RequestsData }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

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
                    <td className="py-2 pr-2">{r.ownerEmail}</td>
                    <td className="py-2 pr-2">{r.planLabel} ({r.interval === "yearly" ? "yıllık" : "aylık"})</td>
                    <td className="py-2 pr-2" title={r.status}>{REQUEST_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2">
                      {r.status === "pending" ? (
                        <span className="flex gap-1">
                          <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "purchase_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>Onayla</button>
                          <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "purchase_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Reddet</button>
                        </span>
                      ) : null}
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
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.trialRequests.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-2">{r.institutionName}</td>
                    <td className="py-2 pr-2">{r.ownerName}</td>
                    <td className="py-2 pr-2">{r.ownerEmail}</td>
                    <td className="py-2 pr-2" title={r.status}>{REQUEST_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2">
                      {r.status === "pending" ? (
                        <span className="flex gap-1">
                          <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "trial_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>Onayla</button>
                          <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "trial_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Reddet</button>
                        </span>
                      ) : null}
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
                    <td className="py-2 pr-2">{r.ownerEmail}</td>
                    <td className="py-2 pr-2" title={r.planKey ?? undefined}>{r.planLabel ?? "—"}</td>
                    <td className="py-2 pr-2">{r.note ?? "—"}</td>
                    <td className="py-2 pr-2" title={r.status}>{REQUEST_STATUS_TR[r.status] ?? r.status}</td>
                    <td className="py-2">
                      {r.status === "pending" ? (
                        <span className="flex gap-1">
                          <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "quote_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>İletişime geçildi</button>
                          <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "quote_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Kapat</button>
                        </span>
                      ) : null}
                    </td>
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
