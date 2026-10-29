const STEPS = ["Paket detayı", "Bilgiler", "Ödeme", "Sonuç"] as const;

/** Satın alma hunisi ilerleme adımları — tüm checkout sayfalarında ortak. */
export function CheckoutSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Satın alma adımları" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          {i > 0 ? <span aria-hidden className="h-px w-6 bg-slate-300 sm:w-10" /> : null}
          <span
            aria-current={i === current ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${
              i === current
                ? "bg-amber-600 text-white ring-amber-600"
                : i < current
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-white text-slate-500 ring-slate-200"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                i === current ? "bg-white/25" : i < current ? "bg-amber-200" : "bg-slate-100"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </span>
            {s}
          </span>
        </li>
      ))}
    </ol>
  );
}
