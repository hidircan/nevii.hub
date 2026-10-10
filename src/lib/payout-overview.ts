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
import { computeTeacherEarningsWithRevisions, payoutDrift, payoutPeriodDayKey, type PayoutLedgerData } from "./teacher-payout";
import { payoutAdjustmentTotal, payoutBalance, payoutNetAmount, payoutPaidAmount } from "./payout-ledger";
import type { AppData, Teacher, TeacherPayoutStatus } from "./types";

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
  /** Hesaplanan (kayıttaki donmuş döküm veya canlı hesap, satır düzeltmeleri dahil). */
  calculated: number;
  /** Düzeltme kayıtları toplamı (+/−). */
  adjustments: number;
  /** Net hakediş = hesaplanan + düzeltmeler. Eski alan adıyla uyum: totalAmount = net. */
  totalAmount: number;
  paid: number;
  /** Kalan bakiye; negatif = fazla ödeme. */
  balance: number;
  /** Kayıtla güncel hesap farkı (politika/kural/hariç tutma sonrası). */
  drift: number;
  hasRecord: boolean;
  status: TeacherPayoutStatus | "no_lessons";
  missingFeeRule: number;
  durationExceptions: number;
};

export function buildPayoutOverviewRows(
  data: PayoutLedgerData & Pick<AppData, "teachers">,
  periodStart: string,
  periodEnd: string
): PayoutOverviewRow[] {
  const startKey = payoutPeriodDayKey(periodStart);
  const endKey = payoutPeriodDayKey(periodEnd);
  const rows: PayoutOverviewRow[] = [];
  for (const teacher of data.teachers) {
    const existingPayout = data.teacherPayouts.find(
      (p) =>
        p.teacherId === teacher.id &&
        p.status !== "cancelled" &&
        payoutPeriodDayKey(p.periodStart) === startKey &&
        payoutPeriodDayKey(p.periodEnd) === endKey
    );
    const earnings = computeTeacherEarningsWithRevisions(data, teacher.id, periodStart, periodEnd);
    const active = teacher.active !== false;
    if (!active && !existingPayout && earnings.totalLessons === 0) continue;
    const net = existingPayout ? payoutNetAmount(existingPayout) : earnings.totalAmount;
    const paid = existingPayout ? payoutPaidAmount(existingPayout) : 0;
    rows.push({
      teacher,
      active,
      lessonCount: earnings.totalLessons,
      calculated: existingPayout ? existingPayout.totalAmount : earnings.totalAmount,
      adjustments: existingPayout ? payoutAdjustmentTotal(existingPayout) : 0,
      totalAmount: net,
      paid,
      balance: existingPayout ? payoutBalance(existingPayout) : earnings.totalAmount,
      drift: existingPayout ? payoutDrift(data, existingPayout) : 0,
      hasRecord: Boolean(existingPayout),
      status: existingPayout ? existingPayout.status : earnings.totalLessons > 0 ? "pending" : "no_lessons",
      missingFeeRule: earnings.missingFeeRuleLessonIds.length,
      durationExceptions: earnings.unsupportedDurationLessonIds.length,
    });
  }
  return rows;
}

export function rowsInPayoutScope(rows: PayoutOverviewRow[], scope: PayoutScope): PayoutOverviewRow[] {
  if (scope === "tum") return rows;
  return rows.filter((r) => (scope === "aktif" ? r.active : !r.active));
}

/** pending = ödenecek kalan (pozitif bakiyeler), paid = gerçekleşen ödemeler, net = toplam hakediş. */
export function sumPayoutRows(rows: PayoutOverviewRow[]): { pending: number; paid: number; net: number; missingFeeRule: number; durationExceptions: number } {
  let pending = 0;
  let paid = 0;
  let net = 0;
  let missingFeeRule = 0;
  let durationExceptions = 0;
  for (const r of rows) {
    if (r.balance > 0) pending += r.balance;
    paid += r.paid;
    net += r.totalAmount;
    missingFeeRule += r.missingFeeRule;
    durationExceptions += r.durationExceptions;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { pending: r2(pending), paid: r2(paid), net: r2(net), missingFeeRule, durationExceptions };
}

/** Pasif öğretmenlerin TÜM dönemlerdeki kayıtlı ama ödenmemiş hakedişleri. */
export function passiveTeacherOpenPayouts(data: Pick<AppData, "teachers" | "teacherPayouts">): {
  total: number;
  count: number;
  teacherCount: number;
} {
  const passive = new Set(data.teachers.filter((t) => t.active === false).map((t) => t.id));
  const open = data.teacherPayouts.filter((p) => p.status !== "cancelled" && passive.has(p.teacherId) && payoutBalance(p) > 0.005);
  return {
    total: open.reduce((s, p) => s + payoutBalance(p), 0),
    count: open.length,
    teacherCount: new Set(open.map((p) => p.teacherId)).size,
  };
}
