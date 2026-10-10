/** yyyy-MM aritmetiği — saf, saat dilimsiz. */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const idx = (y ?? 1970) * 12 + ((m ?? 1) - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Gelecek ay istenirse içinde bulunulan aya sabitlenir (rapor henüz oluşmadı). */
export function clampYearMonth(yearMonth: string | undefined, maxYearMonth: string): string {
  if (!yearMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return maxYearMonth;
  return yearMonth > maxYearMonth ? maxYearMonth : yearMonth;
}
