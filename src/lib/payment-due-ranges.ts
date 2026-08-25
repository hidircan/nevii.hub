/**
 * Faz 1A — öğrencinin birden fazla ödeme günü/aralık tercihi. Saf yardımcı
 * fonksiyonlar: normalize/birleştirme (sistematik, örtük değil) ve
 * insan-okunur biçimlendirme. `Student.paymentDueRanges` ve legacy tekil
 * `Student.paymentDueDay` arasındaki senkron kuralı burada YAŞAR — başka
 * hiçbir yerde tekrar yazılmaz.
 */
import type { PaymentDueRange } from "./types";

/** Ayın günü aralığı — 1 ≤ start ≤ end ≤ 31. */
export function isValidPaymentDueRange(range: PaymentDueRange): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 1 &&
    range.end <= 31 &&
    range.start <= range.end
  );
}

/**
 * Çakışan veya bitişik (ör. [1,5] ve [5,10]) aralıkları TEK aralığa
 * birleştirir — engellemek yerine sistematik birleştirme (plan dokümanında
 * bilinçli karar). Girdi sırasından bağımsız, sonuç her zaman start'a göre
 * artan ve ayrık (arada en az 1 gün boşluk olan) aralıklar döner.
 */
export function normalizePaymentDueRanges(ranges: PaymentDueRange[]): PaymentDueRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: PaymentDueRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** İnsan-okunur gösterim: "Ayın 1–5. günleri, 10. günü" gibi. Boşsa "Belirtilmemiş". */
export function formatPaymentDueRanges(ranges: PaymentDueRange[] | undefined): string {
  if (!ranges || ranges.length === 0) return "Belirtilmemiş";
  return (
    "Ayın " +
    ranges.map((r) => (r.start === r.end ? `${r.start}.` : `${r.start}–${r.end}.`)).join(", ") +
    " günü/günleri"
  );
}

/**
 * Bir öğrencinin GÜNCEL ödeme günü aralıklarını döner — `paymentDueRanges`
 * varsa aynen, yoksa (legacy kayıt) tekil `paymentDueDay`'den tek-elemanlı
 * bir aralık türetir. Hiçbir veri yazmaz — salt okuma yardımcı fonksiyonu.
 */
export function effectivePaymentDueRanges(student: {
  paymentDueRanges?: PaymentDueRange[];
  paymentDueDay?: number;
}): PaymentDueRange[] {
  if (student.paymentDueRanges && student.paymentDueRanges.length > 0) {
    return student.paymentDueRanges;
  }
  return student.paymentDueDay ? [{ start: student.paymentDueDay, end: student.paymentDueDay }] : [];
}
