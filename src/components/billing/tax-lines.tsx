"use client";

/**
 * Ödeme öncesi vergi kırılımı (gösterim). Tutar HER ZAMAN sunucuda yeniden
 * hesaplanır; bu bileşen yalnız bilgilendirir. Örnek oran açıkça işaretlenir.
 */
export function TaxLines({
  amountMinor,
  tax,
  compact,
}: {
  /** KDV hariç ara toplam (minor). */
  amountMinor: number;
  tax: { rateBps: number; rateLabel: string; demo: boolean };
  compact?: boolean;
}) {
  const tr = (minor: number) =>
    (minor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
  const taxMinor = Math.round((amountMinor * tax.rateBps) / 10000);
  const totalMinor = amountMinor + taxMinor;
  return (
    <div className={compact ? "text-sm" : "mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-sm"}>
      <p className="flex items-baseline justify-between gap-3"><span className="min-w-0 text-slate-600">KDV hariç ara toplam</span><span className="shrink-0 whitespace-nowrap tabular-nums">{tr(amountMinor)}</span></p>
      <p className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-slate-600">KDV ({tax.rateLabel}{tax.demo ? ", örnek oran" : ""})</span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{tr(taxMinor)}</span>
      </p>
      <p className="flex items-baseline justify-between gap-3 font-semibold"><span className="shrink-0">Ödenecek toplam</span><span className="whitespace-nowrap tabular-nums">{tr(totalMinor)}</span></p>
      {tax.demo ? <p className="text-xs leading-relaxed text-slate-500">Örnek vergi hesabı; oran doğrulanmadı.</p> : null}
    </div>
  );
}
