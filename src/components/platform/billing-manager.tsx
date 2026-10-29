"use client";

import { useState } from "react";

type Overview = {
  subscriptions: {
    tenantId: string;
    tenantName: string | null;
    planKey: string;
    planLabel: string;
    status: string;
    billingInterval: string;
    amountMinor: number;
    sandbox: boolean;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    paidThrough: string | null;
    canceledAt: string | null;
    cancelAtPeriodEnd: boolean;
    provider: string;
    executionModel: string | null;
    merchantAccount: string;
    providerSubscriptionRef: string | null;
    lastWebhookAt: string | null;
    lastReconciledAt: string | null;
    enforcement: boolean;
    exception: unknown;
    updatedAt: string;
  }[];
  tenants: { tenantId: string; name: string }[];
  lastWebhooks: { id: string; provider: string; eventId: string; eventType: string; tenantId: string | null; status: string; error: string | null; createdAt: string }[];
  failedWebhooks: { id: string; eventId: string; eventType: string; error: string | null; createdAt: string }[];
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR") : "—");
const fmtMinor = (minor: number) => `${(minor / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;

/** Teknik durum kodları → kullanıcı dili (ham kod başlık ipucunda durur). */
const SUBSCRIPTION_STATUS_TR: Record<string, string> = {
  active: "Aktif",
  trialing: "Denemede",
  pending: "İlk ödeme bekleniyor",
  incomplete: "Yarım kaldı",
  past_due: "Ödeme gecikti",
  suspended: "Kısıtlı (ödeme yok)",
  canceled: "İptal edildi",
  expired: "Süresi doldu",
};

const PROVIDER_TR: Record<string, string> = {
  none: "—",
  mock: "Test ödemesi",
  iyzico: "iyzico",
  paytr: "PayTR",
  manual: "Banka transferi",
};

function executionTr(model: string | null): string | null {
  if (model === "MERCHANT_SCHEDULED") return "yenilemeyi NeviiHub başlatır";
  if (model === "PROVIDER_MANAGED") return "yenilemeyi sağlayıcı otomatik çeker";
  return null;
}

/** NeviiOS abonelik yönetimi: erişim kontrolü, istisna, deneme kararı, ödeme karşılaştırma, kampanya. */
export function BillingManager({ data }: { data: Overview }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [exc, setExc] = useState({ tenantId: "", until: "", reason: "" });
  const [man, setMan] = useState({ tenantId: "", providerRef: "", amountTl: "", currency: "TRY", occurredAt: "", note: "" });
  const [cmp, setCmp] = useState({ name: "", tenantId: "", discountType: "percent", percent: "20", amountTl: "", intervalScope: "both", validTo: "", maxRenewals: "12", postCampaignNote: "" });

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
  const input = "w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const btn = "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60";
  const btnGhost = "rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60";
  const tenantOptions = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">Kurum seçin…</option>
      {data.tenants.map((t) => (
        <option key={t.tenantId} value={t.tenantId} title={t.tenantId}>
          {t.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-[var(--radius-md)] px-4 py-2.5 text-sm border ${notice.kind === "error" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]" : "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]"}`}>
          {notice.text}
        </p>
      ) : null}

      <section id="abonelikler" className="scroll-mt-24 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">Kurum abonelikleri ({data.subscriptions.length})</h2>
          <button disabled={busy} className={btnGhost} title="Sağlayıcıdaki ödeme durumlarıyla yerel kayıtları karşılaştırır" onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "reconcile", limit: 25 }); if (d) refresh(); }}>
            Ödeme durumlarını karşılaştır
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Her satır bir kurumun aboneliğidir. Satırdaki bağlantılardan kurum detayına ve belgelerine geçilir.</p>
        {data.subscriptions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Kayıtlı abonelik yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Plan</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 pr-2 font-medium">Ödeme kanalı</th>
                  <th className="py-2 pr-2 font-medium">Tutar</th>
                  <th className="py-2 pr-2 font-medium">Ödenmiş kullanım süresi</th>
                  <th className="py-2 pr-2 font-medium" title="Ödeme durumuna göre erişim kontrolü">Erişim kontrolü</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s) => {
                  const exec = executionTr(s.executionModel);
                  return (
                    <tr key={s.tenantId} className="border-b border-[var(--color-border)] align-top">
                      <td className="py-2 pr-2">
                        <a className="font-semibold text-[var(--color-primary)] hover:underline" href={`/platform/kurumlar/${encodeURIComponent(s.tenantId)}`} title={s.tenantId}>
                          {s.tenantName ?? `${s.tenantId.slice(0, 12)}…`}
                        </a>
                        <span className="mt-0.5 block">
                          <a className="text-[var(--color-text-muted)] hover:underline" href={`/platform/fatura/e-belgeler?tenant=${encodeURIComponent(s.tenantId)}`}>
                            Belgeleri gör →
                          </a>
                        </span>
                      </td>
                      <td className="py-2 pr-2" title={s.planKey}>{s.planLabel} ({s.billingInterval === "yearly" ? "yıllık" : "aylık"})</td>
                      <td className="py-2 pr-2" title={s.status}>{SUBSCRIPTION_STATUS_TR[s.status] ?? s.status}</td>
                      <td className="py-2 pr-2" title={exec ?? s.provider}>{PROVIDER_TR[s.provider] ?? s.provider}{exec ? ` (${exec})` : ""}</td>
                      <td className="py-2 pr-2">{fmtMinor(s.amountMinor)}{s.sandbox ? " (örnek)" : ""}</td>
                      <td className="py-2 pr-2">{fmtDate(s.paidThrough)}</td>
                      <td className="py-2 pr-2">{s.enforcement ? "Açık" : "Kapalı"}</td>
                      <td className="py-2">
                        <button
                          disabled={busy}
                          className={btnGhost}
                          onClick={async () => {
                            const d = await post("/api/v1/platform/billing/overview", { action: "enforcement", tenantId: s.tenantId, enabled: !s.enforcement });
                            if (d) refresh();
                          }}
                        >
                          {s.enforcement ? "Kapat" : "Aç"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="scroll-mt-24 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Geçici erişim izni</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Ödeme beklenirken kuruma geçici erişim verir. Etkisi: seçili kurum, seçili tarihe kadar kısıtlanmaz.</p>
        <div className="grid gap-2 sm:grid-cols-4">
          {tenantOptions(exc.tenantId, (v) => setExc({ ...exc, tenantId: v }), "Kurum")}
          <input type="datetime-local" aria-label="Bitiş" value={exc.until} onChange={(e) => setExc({ ...exc, until: e.target.value })} className={input} />
          <input placeholder="Gerekçe (en az 10 karakter)" aria-label="Gerekçe" value={exc.reason} onChange={(e) => setExc({ ...exc, reason: e.target.value })} className={`${input} sm:col-span-2`} />
        </div>
        <button
          disabled={busy || !exc.tenantId || !exc.until || exc.reason.trim().length < 10}
          className={`${btn} mt-2`}
          onClick={async () => {
            const d = await post("/api/v1/platform/billing/overview", { action: "exception", tenantId: exc.tenantId, until: new Date(exc.until).toISOString(), reason: exc.reason.trim() });
            if (d) refresh();
          }}
        >
          Geçici erişim ver
        </button>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Bu izin ödeme kaydı değildir; gerekçe + bitiş tarihi + denetim kaydı ile saklanır.</p>
      </section>

      <section className="scroll-mt-24 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Banka transferi onayı</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Etkisi: seçili kurumun ödenmiş kullanım süresi uzar. Tutarı dekonttaki KDV dahil toplamla aynı girin.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {tenantOptions(man.tenantId, (v) => setMan({ ...man, tenantId: v }), "Kurum")}
          <input placeholder="Banka referansı" aria-label="Banka referansı" value={man.providerRef} onChange={(e) => setMan({ ...man, providerRef: e.target.value })} className={input} />
          <input type="number" min={0.01} step="0.01" placeholder="Tutar (₺)" aria-label="Tutar TL" value={man.amountTl} onChange={(e) => setMan({ ...man, amountTl: e.target.value })} className={input} />
          <select aria-label="Para birimi" value={man.currency} onChange={(e) => setMan({ ...man, currency: e.target.value })} className={input}>
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
          </select>
          <input type="datetime-local" aria-label="Ödeme tarihi" value={man.occurredAt} onChange={(e) => setMan({ ...man, occurredAt: e.target.value })} className={input} />
          <input placeholder="Açıklama" aria-label="Açıklama" value={man.note} onChange={(e) => setMan({ ...man, note: e.target.value })} className={input} />
        </div>
        <button
          disabled={busy || !man.tenantId || man.providerRef.trim().length < 3 || !man.amountTl || !man.occurredAt || man.note.trim().length < 5}
          className={`${btn} mt-2`}
          onClick={async () => {
            const d = await post("/api/v1/platform/billing/overview", {
              action: "manual_approve",
              tenantId: man.tenantId,
              providerRef: man.providerRef.trim(),
              amountTl: man.amountTl,
              currency: man.currency,
              occurredAt: new Date(man.occurredAt).toISOString(),
              note: man.note.trim(),
            });
            if (d) refresh();
          }}
        >
          Transferi onayla
        </button>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Yalnız bu onay erişim açar; &ldquo;ödedim&rdquo; beyanı açmaz. Bu kayıt ödeme bilgisidir, fatura değildir.
          Her dönem için ayrı onay gerekir (otomatik kart çekimi değildir).
        </p>
      </section>

      <section id="kampanyalar" className="scroll-mt-24 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Pilot kampanya oluştur</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Kampanya yalnız seçili kuruma uygulanır; herkese açık kupon değildir.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input placeholder="Ad" aria-label="Kampanya adı" value={cmp.name} onChange={(e) => setCmp({ ...cmp, name: e.target.value })} className={input} />
          {tenantOptions(cmp.tenantId, (v) => setCmp({ ...cmp, tenantId: v }), "Pilot kurum")}
          <select aria-label="İndirim türü" value={cmp.discountType} onChange={(e) => setCmp({ ...cmp, discountType: e.target.value })} className={input}>
            <option value="percent">Yüzde</option>
            <option value="fixed_minor">Sabit tutar (₺)</option>
          </select>
          {cmp.discountType === "percent" ? (
            <input type="number" min={1} max={100} placeholder="Yüzde" aria-label="Yüzde" value={cmp.percent} onChange={(e) => setCmp({ ...cmp, percent: e.target.value })} className={input} />
          ) : (
            <input type="number" min={0} step="0.01" placeholder="Tutar (₺)" aria-label="Sabit tutar TL" value={cmp.amountTl} onChange={(e) => setCmp({ ...cmp, amountTl: e.target.value })} className={input} />
          )}
          <select aria-label="Periyot kapsamı" value={cmp.intervalScope} onChange={(e) => setCmp({ ...cmp, intervalScope: e.target.value })} className={input}>
            <option value="both">Aylık + Yıllık</option>
            <option value="monthly">Yalnız aylık</option>
            <option value="yearly">Yalnız yıllık</option>
          </select>
          <input type="date" aria-label="Bitiş" value={cmp.validTo} onChange={(e) => setCmp({ ...cmp, validTo: e.target.value })} className={input} />
          <input type="number" min={0} placeholder="Azami yenileme" aria-label="Azami yenileme" value={cmp.maxRenewals} onChange={(e) => setCmp({ ...cmp, maxRenewals: e.target.value })} className={input} />
          <input placeholder="Sonrası fiyat notu (zorunlu)" aria-label="Sonrası fiyat" value={cmp.postCampaignNote} onChange={(e) => setCmp({ ...cmp, postCampaignNote: e.target.value })} className={`${input} sm:col-span-2`} />
        </div>
        <button
          disabled={busy || !cmp.name || !cmp.tenantId || !cmp.postCampaignNote}
          className={`${btn} mt-2`}
          onClick={async () => {
            const d = await post("/api/v1/platform/billing/campaigns", {
              action: "create",
              name: cmp.name,
              tenantId: cmp.tenantId,
              discountType: cmp.discountType,
              percent: cmp.discountType === "percent" ? Number(cmp.percent) : null,
              amountTl: cmp.discountType === "fixed_minor" ? cmp.amountTl : null,
              intervalScope: cmp.intervalScope,
              validTo: cmp.validTo ? new Date(cmp.validTo).toISOString() : null,
              maxRenewals: cmp.maxRenewals ? Number(cmp.maxRenewals) : null,
              postCampaignNote: cmp.postCampaignNote,
            });
            if (d) refresh();
          }}
        >
          Kampanya oluştur
        </button>
      </section>

      <section className="scroll-mt-24 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="mb-1 text-base font-semibold">Başarısız bildirim işleri ({data.failedWebhooks.length})</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Sağlayıcıdan gelen ve işlenemeyen ödeme bildirimleri. Kayıt silinmez; sorun çözülünce yeniden işlenir.</p>
        {data.failedWebhooks.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Başarısız iş yok.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.failedWebhooks.map((w) => (
              <li key={w.id} className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 border border-[var(--color-border)]">
                Sağlayıcı bildirimi işlenemedi · {new Date(w.createdAt).toLocaleString("tr-TR")}
                <details className="mt-1">
                  <summary className="cursor-pointer text-[var(--color-text-muted)] hover:underline">Teknik ayrıntı</summary>
                  <p className="mt-1 font-mono text-[var(--color-text-muted)]">{w.eventId} · {w.eventType} · {w.error ?? "hata detayı yok"}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
