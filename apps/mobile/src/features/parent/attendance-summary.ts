import type { Locale } from "../../i18n/locales";
import { getActiveLocale } from "../../i18n/locale-store";
import type { AttendanceLedgerResponse, AttendanceSummary } from "../../types/api";

/**
 * Parent yoklama özeti view-model'i — saf, test edilebilir dönüşüm.
 *
 * Backend sayıları her zaman güvenilir gelmeyebilir (eksik alan, 0 toplam);
 * bu katman crash/division-by-zero/NaN üretmez:
 * - sonlu, negatif-olmayan tam sayıya zorlar (bozuk değer → 0),
 * - toplam 0 ise oran 0'dır (bölme yapılmaz),
 * - yanıt yoksa `null` döner; ekran fake kart üretmeden empty state gösterir.
 */
export type AttendanceView = {
  total: number;
  attended: number;
  absent: number;
  excused: number;
  makeup: number;
  pending: number;
  /** 0–100 katılım oranı; kayıt yoksa 0. */
  rate: number;
  /** İşlenmiş en az bir ders kaydı var. */
  hasRecords: boolean;
};

export function toSafeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function toAttendanceRate(total: number, attended: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (attended / total) * 100));
}

export function toAttendanceView(summary: AttendanceSummary | null | undefined): AttendanceView | null {
  if (!summary) return null;
  const total = toSafeCount(summary.totalLessons);
  const attended = toSafeCount(summary.attended);
  return {
    total,
    attended,
    absent: toSafeCount(summary.absent),
    excused: toSafeCount(summary.excused),
    makeup: toSafeCount(summary.makeup),
    pending: toSafeCount(summary.pending),
    rate: toAttendanceRate(total, attended),
    hasRecords: total > 0,
  };
}

/**
 * Ledger counts → aynı görünüm. "Katıldı" Geldi+İşlendi'yi kapsar (özet
 * endpointiyle AYNI tanım); "Bekleyen" sonuçlanmamış + planlananı kapsar.
 */
export function toAttendanceViewFromLedger(ledger: AttendanceLedgerResponse | null | undefined): AttendanceView | null {
  if (!ledger) return null;
  const c = ledger.counts;
  const attended = toSafeCount(c.attended) + toSafeCount(c.processed);
  const total = toSafeCount(ledger.total);
  return {
    total,
    attended,
    absent: toSafeCount(c.absent),
    excused: toSafeCount(c.excused),
    makeup: toSafeCount(c.makeup),
    pending: toSafeCount(c.pending) + toSafeCount(c.upcoming),
    rate: toAttendanceRate(total, attended),
    hasRecords: total > 0,
  };
}

/** Ekran okuyucu için oran + durum özeti (tek cümle, aktif dilde). */
export function attendanceA11yLabel(view: AttendanceView, locale: Locale = getActiveLocale()): string {
  if (locale === "en") {
    return `Attendance rate ${Math.round(view.rate)} percent. ${view.attended} of ${view.total} lessons attended, ${view.absent} absent, ${view.excused} excused.`;
  }
  return `Katılım oranı yüzde ${Math.round(view.rate)}. ${view.total} dersten ${view.attended} katılım, ${view.absent} devamsızlık, ${view.excused} izinli.`;
}
