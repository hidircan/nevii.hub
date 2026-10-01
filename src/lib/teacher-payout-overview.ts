import { format, parseISO } from "date-fns";
import type { AppData } from "./types";
import { computeTeacherEarningsForPeriod, type PayoutLedgerData } from "./teacher-payout";
import { activePayments, payoutBalance } from "./payout-ledger";

function dayKey(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd");
}

export type TeacherPayoutOverview = {
  pendingTotal: number;
  paidTotal: number;
  missingFeeRuleLessonCount: number;
};

/**
 * Tüm öğretmenler için dönem özeti — mevcut `computeTeacherEarningsForPeriod`
 * dışında HİÇBİR hesaplama kuralı içermez, yalnızca öğretmen bazında çağırıp
 * toplar:
 * - `pendingTotal`: bu dönem için zaten bir `TeacherPayout` snapshot'ı varsa
 *   (status "pending") onun DONMUŞ tutarı; yoksa `computeTeacherEarningsForPeriod`
 *   ile canlı hesaplanan tutar (henüz resmi hakediş kaydı açılmamış öğretmenler
 *   için "şu an kapatılsa ne ödenir" tahmini).
 * - `paidTotal`: `paidAt` bu dönem içine düşen, status "paid" tüm payout'ların
 *   toplamı — dönemi (periodStart/periodEnd) değil, fiilen ÖDENDİĞİ tarihi
 *   baz alır.
 * - `missingFeeRuleLessonCount`: henüz payout'u oluşturulmamış öğretmenlerin
 *   bu dönemdeki eksik-ücret-kurallı tamamlanmış ders sayısı toplamı.
 */
export function computeTeacherPayoutOverview(
  data: PayoutLedgerData & Pick<AppData, "teachers">,
  periodStart: string,
  periodEnd: string
): TeacherPayoutOverview {
  let pendingTotal = 0;
  let missingFeeRuleLessonCount = 0;

  for (const teacher of data.teachers) {
    const existing = data.teacherPayouts.find(
      (p) => p.teacherId === teacher.id && p.status !== "cancelled" && p.periodStart === periodStart && p.periodEnd === periodEnd
    );
    if (existing) {
      pendingTotal += Math.max(0, payoutBalance(existing));
      continue;
    }
    const earnings = computeTeacherEarningsForPeriod(data, teacher.id, periodStart, periodEnd);
    pendingTotal += earnings.totalAmount;
    missingFeeRuleLessonCount += earnings.missingFeeRuleLessonIds.length;
  }

  const periodStartKey = dayKey(periodStart);
  const periodEndKey = dayKey(periodEnd);
  // Ödeme tarihine göre (kısmi ödemeler dahil) — defter satırlarından.
  const paidTotal = data.teacherPayouts
    .filter((p) => p.status !== "cancelled")
    .flatMap((p) => activePayments(p))
    .filter((x) => {
      const paidKey = dayKey(x.paidAt);
      return paidKey >= periodStartKey && paidKey <= periodEndKey;
    })
    .reduce((sum, x) => sum + x.amount, 0);

  return { pendingTotal, paidTotal, missingFeeRuleLessonCount };
}
