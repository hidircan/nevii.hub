"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftYearMonth } from "@/lib/year-month";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function monthLabelTr(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? yearMonth} ${y}`;
}

/**
 * Ay gezgini — önceki / sonraki / bu ay + ay seçici. Performans gibi
 * geçmişe dönük raporlarda `maxYearMonth` (içinde bulunulan ay) sonrasına
 * gidilemez: ileri düğmesi pasifleşir, seçici üst sınırı aynı aydır.
 * URL tek kaynaktır (`param`), paylaşılabilir ve geri/ileri ile çalışır.
 */
export function MonthNavigator({
  basePath,
  yearMonth,
  maxYearMonth,
  param = "yearMonth",
}: {
  basePath: string;
  yearMonth: string;
  maxYearMonth: string;
  param?: string;
}) {
  const router = useRouter();
  const href = (ym: string) => `${basePath}?${param}=${ym}`;
  const prev = shiftYearMonth(yearMonth, -1);
  const next = shiftYearMonth(yearMonth, 1);
  const atMax = yearMonth >= maxYearMonth;
  const btn =
    "inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]";

  return (
    <nav aria-label="Ay seçimi" className="flex flex-wrap items-center gap-1.5">
      <Link href={href(prev)} className={btn} aria-label={`Önceki ay: ${monthLabelTr(prev)}`}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        {monthLabelTr(prev)}
      </Link>
      <input
        type="month"
        value={yearMonth}
        max={maxYearMonth}
        aria-label="Ay seç"
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}$/.test(v)) router.push(href(v > maxYearMonth ? maxYearMonth : v));
        }}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
      />
      {atMax ? (
        <span className={`${btn} cursor-not-allowed opacity-40`} aria-disabled title="Gelecek aylar için henüz veri oluşmadı">
          {monthLabelTr(next)}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : (
        <Link href={href(next)} className={btn} aria-label={`Sonraki ay: ${monthLabelTr(next)}`}>
          {monthLabelTr(next)}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      {yearMonth !== maxYearMonth ? (
        <Link
          href={href(maxYearMonth)}
          className="rounded-lg border border-[var(--color-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
        >
          Bu aya dön
        </Link>
      ) : null}
    </nav>
  );
}
