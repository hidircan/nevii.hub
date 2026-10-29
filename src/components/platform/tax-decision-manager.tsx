"use client";

import { useState } from "react";

type Decision = {
  version: number;
  status: string;
  rateBps: number;
  validFrom: string;
  reason: string;
  publishedBy: string;
  publishedAt: string;
};

export function TaxDecisionManager({ effective, initialRows }: {
  effective: { rateBps: number; rateLabel: string; verified: boolean; demo: boolean; source: string };
  initialRows: Decision[];
}) {
  const [rows, setRows] = useState<Decision[]>(initialRows);
  const [rate, setRate] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function reload() {
    try {
      const res = await fetch("/api/v1/platform/billing/tax-decision", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; data?: Decision[]; error?: { message?: string } };
      if (json.ok && Array.isArray(json.data)) setRows(json.data);
    } catch {
      /* liste yenilenemezse mevcut satırlar durur */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/platform/billing/tax-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateBps: Math.round(Number(rate) * 100), validFrom, reason }),
      });
      const json = (await res.json()) as { ok: boolean; data?: { version: number }; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "Karar kaydedilemedi." });
        return;
      }
      setNotice({
        kind: "ok",
        text: `Karar v${json.data?.version} kaydedildi (denetim izi). Yürürlük için env güncellemesi gerekli — alttaki adımı uygulayın.`,
      });
      setRate("");
      setValidFrom("");
      setReason("");
      void reload();
    } catch {
      setBusy(false);
      setNotice({ kind: "error", text: "Sunucuya ulaşılamadı." });
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold">Yürürlükteki oran (tek kaynak)</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--color-text-muted)]">Oran</dt><dd className="font-medium">{effective.rateLabel}</dd></div>
          <div>
            <dt className="text-[var(--color-text-muted)]">Durum</dt>
            <dd className="font-medium">
              {effective.verified ? "Doğrulanmış (mali müşavir/owner)" : effective.demo ? "Örnek oran — gerçek tahsilat kapalı" : "Doğrulanmamış"}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Kaynak: {effective.source}</p>
        {!effective.verified ? (
          <p role="note" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            Oran doğrulanmamışken gerçek checkout kapalı kalır; demo oran faturalarda örnek vergi hesabı olarak işaretlenir.
            Bilinmeyen oran 0 veya muafiyet sayılmaz.
          </p>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold">Yeni oran kararı kaydet</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Bu form oranı YÜRÜRLÜĞE KOYMAZ; kararı gerekçesiyle denetim izine işler. Geçmiş ödeme,
          fatura ve kabul snapshot&apos;ları yeniden hesaplanmaz — yeni oran yalnız yeni işlemlerde kullanılır.
        </p>
        <form onSubmit={submit} className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <label htmlFor="tax-rate" className="mb-1 block font-medium">Oran (%)</label>
            <input
              id="tax-rate"
              required
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="örn. 20"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="tax-valid" className="mb-1 block font-medium">Geçerlilik (GG.AA.YYYY)</label>
            <input
              id="tax-valid"
              required
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2"
            />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="tax-reason" className="mb-1 block font-medium">Gerekçe (zorunlu)</label>
            <input
              id="tax-reason"
              required
              minLength={8}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="örn. Mali müşavir 2026-10-29 yazısı"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? "Kaydediliyor…" : "Kararı kaydet"}
            </button>
          </div>
        </form>
        {notice ? (
          <p role={notice.kind === "error" ? "alert" : "status"} className="mt-3 text-sm">{notice.text}</p>
        ) : null}
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
          <p className="font-semibold">Yürürlüğe alma (env — bu ekran otomatik yapmaz):</p>
          <pre className="mt-1 overflow-x-auto">SAAS_TAX_RATE_BPS=&lt;baz puan, örn. 2000&gt;{"\n"}SAAS_TAX_RATE_VERIFIED=true</pre>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
        <h2 className="text-base font-semibold">Karar geçmişi</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Kayıtlı karar yok.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-2 font-medium">Sürüm</th>
                  <th className="py-2 pr-2 font-medium">Oran</th>
                  <th className="py-2 pr-2 font-medium">Geçerlilik</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 pr-2 font-medium">Gerekçe</th>
                  <th className="py-2 font-medium">Kaydeden</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.version} className="border-b border-[var(--color-border)]">
                    <td className="py-2 pr-2">v{r.version}</td>
                    <td className="py-2 pr-2">%{(r.rateBps / 100).toLocaleString("tr-TR")}</td>
                    <td className="py-2 pr-2">{r.validFrom}</td>
                    <td className="py-2 pr-2">{r.status === "published" ? "Yayında (kayıt)" : r.status}</td>
                    <td className="py-2 pr-2">{r.reason}</td>
                    <td className="py-2">{r.publishedBy}</td>
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
