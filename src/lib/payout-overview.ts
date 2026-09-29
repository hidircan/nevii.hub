/**
 * 9. tur (2026-09-27) — Öğretmen Hakedişleri özetinin KAPSAM kuralı, tek kaynak.
 *
 * Kök neden: özet yalnız `teacher.active` öğretmenleri listeliyordu. Öğretmen
 * pasife alınınca o ayın hesaplanmış/ödenmiş hakedişi ve açık kalan hakkı
 * listeden ve "Bekleyen/Ödenen toplam"dan SESSİZCE düşüyordu (kayıtlar
 * silinmiyordu ama görünmez oluyordu).
 *
 * Kurallar — hesap kuralları DEĞİŞMEZ (oran, süre, ders bazlı hesap
 * `computeTeacherEarningsWithRevisions`'dan aynen gelir; kayıtlı hakediş
 * varsa tutar onun `totalAmount`'u):
 *  - Aktif öğretmen her zaman listelenir (ders yoksa "Ders yok").
 *  - Pasif öğretmen, seçili dönemde işlenmiş dersi veya kayıtlı hakedişi
 *    varsa listelenir — geçmiş hakkı kaybolmaz; hiç hareketi yoksa gürültü yapmaz.
 *  - "Pasif öğretmene kalan yükümlülük" = pasif öğretmenin ÖDENMEMİŞ
 *    hakedişi. Dönem içi: bekleyen satırlar. Tüm dönemler: kayıtlı
 *    (`TeacherPayout.status === "pending"`) hakedişler — kayda geçmemiş eski
 *    dönemler hesaplanmaz (tahmin yok), ekranda bu sınır yazılır.
 *  - Toplamlar yalnız listelenen satırlardan hesaplanır → rapor = detay.
 *  - Devamsızlık/iptal hakedişten OTOMATİK kesinti üretmez (owner onayı olmadan yeni finans kuralı yok).
 */
import { computeTeacherEarningsWithRevisions, payoutPeriodDayKey } from "./teacher-payout";
import type { AppData, Teacher } from "./types";

export type PayoutScope = "aktif" | "pasif" | "tum";

export const PAYOUT_SCOPE_LABEL: Record<PayoutScope, string> = {
  aktif: "Aktif öğretmenler",
  pasif: "Pasif öğretmenler",
  tum: "Tüm geçmiş",
};

export function parsePayoutScope(raw: string | undefined | null): PayoutScope {
  return raw === "pasif" || raw === "tum" ? raw : "aktif";
}

export type PayoutOverviewRow = {
  teacher: Teacher;
  active: boolean;
  lessonCount: number;
  totalAmount: number;
  status: "pending" | "paid" | "no_lessons";
  missingFeeRule: number;
};

export function buildPayoutOverviewRows(data: AppData, periodStart: string, periodEnd: string): PayoutOverviewRow[] {
  const startKey = payoutPeriodDayKey(periodStart);
  const endKey = payoutPeriodDayKey(periodEnd);
  const rows: PayoutOverviewRow[] = [];
  for (const teacher of data.teachers) {
    const existingPayout = data.teacherPayouts.find(
      (p) =>
        p.teacherId === teacher.id &&
        payoutPeriodDayKey(p.periodStart) === startKey &&
        payoutPeriodDayKey(p.periodEnd) === endKey
    );
    const earnings = computeTeacherEarningsWithRevisions(data, teacher.id, periodStart, periodEnd);
    const active = teacher.active !== false;
    if (!active && !existingPayout && earnings.totalLessons === 0) continue;
    rows.push({
      teacher,
      active,
      lessonCount: earnings.totalLessons,
      totalAmount: existingPayout ? existingPayout.totalAmount : earnings.totalAmount,
      status: existingPayout ? existingPayout.status : earnings.totalLessons > 0 ? "pending" : "no_lessons",
      // Tutarı hesaplanamayan ders: ücret kuralı eksik (mevcut politika) veya süre 30/40/50 değil (sabit ücret).
      missingFeeRule: earnings.missingFeeRuleLessonIds.length + earnings.unsupportedDurationLessonIds.length,
    });
  }
  return rows;
}

export function rowsInPayoutScope(rows: PayoutOverviewRow[], scope: PayoutScope): PayoutOverviewRow[] {
  if (scope === "tum") return rows;
  return rows.filter((r) => (scope === "aktif" ? r.active : !r.active));
}

export function sumPayoutRows(rows: PayoutOverviewRow[]): { pending: number; paid: number; missingFeeRule: number } {
  let pending = 0;
  let paid = 0;
  let missingFeeRule = 0;
  for (const r of rows) {
    if (r.status === "pending") pending += r.totalAmount;
    if (r.status === "paid") paid += r.totalAmount;
    missingFeeRule += r.missingFeeRule;
  }
  return { pending, paid, missingFeeRule };
}

/** Pasif öğretmenlerin TÜM dönemlerdeki kayıtlı ama ödenmemiş hakedişleri. */
export function passiveTeacherOpenPayouts(data: Pick<AppData, "teachers" | "teacherPayouts">): {
  total: number;
  count: number;
  teacherCount: number;
} {
  const passive = new Set(data.teachers.filter((t) => t.active === false).map((t) => t.id));
  const open = data.teacherPayouts.filter((p) => p.status === "pending" && passive.has(p.teacherId));
  return {
    total: open.reduce((s, p) => s + p.totalAmount, 0),
    count: open.length,
    teacherCount: new Set(open.map((p) => p.teacherId)).size,
  };
}
