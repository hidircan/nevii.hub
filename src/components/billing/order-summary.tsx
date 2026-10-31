/**
 * Satın alma hunisi sipariş özeti satırları — /satin-al, /satin-al/hesap ve
 * /satin-al/fatura'da ortak. Tutarlar ASLA alt satıra taşmaz (nowrap +
 * shrink-0); etiket gerekirse kendi içinde kayar.
 */
export function OrderSummaryRows({
  planLabel,
  intervalLabel,
  exVatDisplay,
  monthlyEquivalentDisplay,
  subtotalDisplay,
  taxLabel,
  taxDisplay,
  totalDisplay,
  demoNote,
}: {
  planLabel: string;
  intervalLabel: string;
  exVatDisplay: string;
  monthlyEquivalentDisplay: string | null;
  /** Varsa KDV satırının üstünde "KDV hariç ara toplam" satırı gösterir. */
  subtotalDisplay?: string | null;
  taxLabel: string;
  taxDisplay: string;
  totalDisplay: string;
  demoNote: string | null;
}) {
  return (
    <div className="space-y-2.5 text-sm">
      <p className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 leading-snug text-slate-600">
          {planLabel} ({intervalLabel})
        </span>
        <strong className="shrink-0 whitespace-nowrap tabular-nums">{exVatDisplay}</strong>
      </p>
      {monthlyEquivalentDisplay ? (
        <p className="-mt-1 text-xs leading-relaxed text-slate-500">
          Yılda tek tahsilat. Aylık eşdeğer {monthlyEquivalentDisplay}.
        </p>
      ) : null}
      {subtotalDisplay ? (
        <p className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2.5">
          <span className="min-w-0 text-slate-600">KDV hariç ara toplam</span>
          <strong className="shrink-0 whitespace-nowrap tabular-nums">{subtotalDisplay}</strong>
        </p>
      ) : null}
      <p className={`flex items-baseline justify-between gap-3 ${subtotalDisplay ? "" : "border-t border-slate-100 pt-2.5"}`}>
        <span className="min-w-0 text-slate-600">{taxLabel}</span>
        <strong className="shrink-0 whitespace-nowrap tabular-nums">{taxDisplay}</strong>
      </p>
      <p className="rounded-xl bg-[#f6f0e4] px-4 py-3 ring-1 ring-[#e3d6bc]">
        <span className="block text-xs font-semibold text-[#5c3d00]">Ödenecek toplam</span>
        <strong className="mt-0.5 block whitespace-nowrap text-2xl tabular-nums">{totalDisplay}</strong>
      </p>
      {demoNote ? <p className="text-xs leading-relaxed text-slate-500">{demoNote}</p> : null}
    </div>
  );
}
