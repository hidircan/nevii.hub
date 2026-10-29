"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  code: string;
  tenantId: string | null;
  tenantName: string | null;
  discountType: "fixed_minor" | "percent";
  amountMinor: number | null;
  percent: number | null;
  intervalScope: "monthly" | "yearly" | "both";
  validTo: string | null;
  maxRenewals: number | null;
  redeemedCount: number;
  postCampaignNote: string;
  active: boolean;
  createdAt: string;
};

const SCOPE_TR: Record<string, string> = { monthly: "Yalnız aylık", yearly: "Yalnız yıllık", both: "Aylık + Yıllık" };
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR") : "—");
const fmtMinor = (minor: number) => `${(minor / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;

/** Kampanyaların TEK yönetim ekranı (oluşturma + kapatma + liste). */
export function CampaignsManager({
  campaigns,
  tenants,
}: {
  campaigns: Campaign[];
  tenants: { tenantId: string; name: string }[];
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [cmp, setCmp] = useState({ name: "", tenantId: "", discountType: "percent", percent: "20", amountTl: "", intervalScope: "both", validTo: "", maxRenewals: "12", postCampaignNote: "" });
  const dirty = Boolean(cmp.name.trim() || cmp.tenantId || cmp.postCampaignNote.trim());
  useEffect(() => {
    if (!dirty || busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, busy]);

  async function post(body: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/platform/billing/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "İşlem başarısız." });
        return false;
      }
      setNotice({ kind: "ok", text: "İşlem tamamlandı." });
      return true;
    } catch {
      setBusy(false);
      setNotice({ kind: "error", text: "Bağlantı hatası." });
      return false;
    }
  }

  const refresh = () => window.location.reload();
  const input = "w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const inputLabel = "mb-1 block text-xs font-medium text-[var(--color-text-muted)]";
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
        <h2 className="mb-1 text-base font-semibold">Kampanyalar ({campaigns.length})</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Kampanya yalnız bağlı kuruma uygulanır; herkese açık kupon değildir. Kapatılan kampanya yeni satışta kullanılmaz, geçmiş hakları değiştirmez.</p>
        {campaigns.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Kayıtlı kampanya yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Ad</th>
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">İndirim</th>
                  <th className="py-2 pr-2 font-medium">Kapsam</th>
                  <th className="py-2 pr-2 font-medium">Bitiş</th>
                  <th className="py-2 pr-2 font-medium">Kullanım</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] align-top">
                    <td className="py-2 pr-2 font-semibold">{c.name}</td>
                    <td className="py-2 pr-2">{c.tenantName ?? "—"}</td>
                    <td className="py-2 pr-2">
                      {c.discountType === "percent" ? `%${c.percent}` : c.amountMinor != null ? fmtMinor(c.amountMinor) : "—"}
                    </td>
                    <td className="py-2 pr-2">{SCOPE_TR[c.intervalScope] ?? c.intervalScope}</td>
                    <td className="py-2 pr-2">{fmtDate(c.validTo)}</td>
                    <td className="py-2 pr-2" title={c.postCampaignNote}>
                      {c.redeemedCount} kullanım{c.maxRenewals ? ` / en çok ${c.maxRenewals} yenileme` : ""}
                    </td>
                    <td className="py-2 pr-2">{c.active ? "Açık" : "Kapalı"}</td>
                    <td className="py-2">
                      {c.active ? (
                        <button
                          disabled={busy}
                          className={btnGhost}
                          onClick={async () => {
                            if (!window.confirm(`“${c.name}” kapatılsın mı? Yeni satışta kullanılmaz.`)) return;
                            if (await post({ action: "deactivate", id: c.id })) refresh();
                          }}
                        >
                          Kapat
                        </button>
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
        <h2 className="mb-1 text-base font-semibold">Pilot kampanya oluştur</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Kampanya yalnız seçili kuruma uygulanır; herkese açık kupon değildir.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={inputLabel} htmlFor="cmp-name">Ad (zorunlu)</label>
            <input id="cmp-name" value={cmp.name} onChange={(e) => setCmp({ ...cmp, name: e.target.value })} className={input} />
          </div>
          <div>
            <label className={inputLabel} htmlFor="cmp-tenant">Pilot kurum (zorunlu)</label>
            <select id="cmp-tenant" value={cmp.tenantId} onChange={(e) => setCmp({ ...cmp, tenantId: e.target.value })} className={input}>
              <option value="">Kurum seçin…</option>
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId} title={t.tenantId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={inputLabel} htmlFor="cmp-type">İndirim türü</label>
            <select id="cmp-type" value={cmp.discountType} onChange={(e) => setCmp({ ...cmp, discountType: e.target.value })} className={input}>
              <option value="percent">Yüzde</option>
              <option value="fixed_minor">Sabit tutar (₺)</option>
            </select>
          </div>
          {cmp.discountType === "percent" ? (
            <div>
              <label className={inputLabel} htmlFor="cmp-percent">Yüzde</label>
              <input id="cmp-percent" type="number" min={1} max={100} value={cmp.percent} onChange={(e) => setCmp({ ...cmp, percent: e.target.value })} className={input} />
            </div>
          ) : (
            <div>
              <label className={inputLabel} htmlFor="cmp-amount">Sabit tutar (₺)</label>
              <input id="cmp-amount" type="number" min={0} step="0.01" value={cmp.amountTl} onChange={(e) => setCmp({ ...cmp, amountTl: e.target.value })} className={input} />
            </div>
          )}
          <div>
            <label className={inputLabel} htmlFor="cmp-scope">Periyot kapsamı</label>
            <select id="cmp-scope" value={cmp.intervalScope} onChange={(e) => setCmp({ ...cmp, intervalScope: e.target.value })} className={input}>
              <option value="both">Aylık + Yıllık</option>
              <option value="monthly">Yalnız aylık</option>
              <option value="yearly">Yalnız yıllık</option>
            </select>
          </div>
          <div>
            <label className={inputLabel} htmlFor="cmp-valid">Bitiş (boş = süresiz)</label>
            <input id="cmp-valid" type="date" value={cmp.validTo} onChange={(e) => setCmp({ ...cmp, validTo: e.target.value })} className={input} />
          </div>
          <div>
            <label className={inputLabel} htmlFor="cmp-renew">Azami yenileme</label>
            <input id="cmp-renew" type="number" min={0} value={cmp.maxRenewals} onChange={(e) => setCmp({ ...cmp, maxRenewals: e.target.value })} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={inputLabel} htmlFor="cmp-post">Sonrası fiyat notu (zorunlu)</label>
            <input id="cmp-post" value={cmp.postCampaignNote} onChange={(e) => setCmp({ ...cmp, postCampaignNote: e.target.value })} className={input} />
          </div>
        </div>
        {dirty && !busy ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Kaydedilmemiş kampanya taslağı var; sayfadan ayrılırsanız kaybolur.</p> : null}
        <button
          disabled={busy || !cmp.name.trim() || !cmp.tenantId || !cmp.postCampaignNote.trim()}
          className={`${btn} mt-3`}
          onClick={async () => {
            const d = await post({
              action: "create",
              name: cmp.name.trim(),
              tenantId: cmp.tenantId,
              discountType: cmp.discountType,
              percent: cmp.discountType === "percent" ? Number(cmp.percent) : null,
              amountTl: cmp.discountType === "fixed_minor" ? cmp.amountTl : null,
              intervalScope: cmp.intervalScope,
              validTo: cmp.validTo ? new Date(cmp.validTo).toISOString() : null,
              maxRenewals: cmp.maxRenewals ? Number(cmp.maxRenewals) : null,
              postCampaignNote: cmp.postCampaignNote.trim(),
            });
            if (d) refresh();
          }}
        >
          Kampanya oluştur
        </button>
      </section>
    </div>
  );
}
