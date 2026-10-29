/**
 * 2026-10-06 — Öğretmen hakediş DÖKÜMÜ (aylık + yıllık), TEK hesap yolu.
 *
 * Kök neden (owner bildirimi): "Aylık döküm" bağlantısı sunucu saatinin ayıyla üretiliyordu (Eylül'e bakarken
 * Ekim basılıyordu); "Yıllık döküm" 12 ayı TEK canlı dönem olarak hesaplıyordu — kayıtlı aylık hakedişlerin
 * donmuş kalemleri, satır düzeltmeleri, ek/eksi düzeltmeleri ve ödemeleri yoktu, boş aylar hiç görünmüyordu.
 *
 * Kural (her ay için hakediş ekranıyla birebir — `computeTeacherPayoutTool`):
 * - Ayın aktif hakediş kaydı varsa: kalemler kayıttan (donmuş) + satır düzeltmeleri; tutarlar defterden
 *   (hesaplanan · düzeltme · net · ödenen · kalan). Kayıt yeniden hesaplanmaz/yazılmaz.
 * - Kayıt yoksa: canlı hesap (`computeTeacherEarningsForPeriod`); düzeltme/ödeme 0, durum "Kayıt yok".
 * - Yıllık = 12 ayın aylık sonuçlarının toplamı; böylece yıllık ve aylık döküm her zaman uzlaşır.
 * - Dönem kuralı: ders, İstanbul takvim gününe göre ait olduğu aya yazılır (hakediş dönemi). Ödeme ve
 *   düzeltmeler ÖDENDİKLERİ TARİHTEN bağımsız olarak karşıladıkları hakediş ayına yazılır; ödeme tarihi ayrıca
 *   gösterilir.
 */
import type { Lesson, TeacherPayout, TeacherPayoutStatus } from "./types";
import {
  applyPayoutLineOverrides,
  computeTeacherEarningsForPeriod,
  payoutBaseEarnings,
  payoutDrift,
  payoutPeriodDayKey,
  type PayoutLedgerData,
  type RevisedEarningsLine,
} from "./teacher-payout";
import { payoutAdjustmentTotal, payoutBalance, payoutNetAmount, payoutPaidAmount, round2 } from "./payout-ledger";
import { isAttendedPlannedMakeup } from "./lesson-live-status";

export type StatementLineKind = "lesson" | "makeup" | "club" | "trial";

export const STATEMENT_LINE_KIND_LABEL: Record<StatementLineKind, string> = {
  lesson: "Ders",
  makeup: "Telafi",
  club: "Kulüp",
  trial: "Deneme",
};

export type StatementLine = RevisedEarningsLine & {
  kind: StatementLineKind;
  /** Planlanan telafi dersine "Geldi" (T işareti). */
  attendedPlannedMakeup: boolean;
};

export type StatementLedgerEntry = {
  type: "payment" | "adjustment";
  id: string;
  /** Hakediş dönemi (yyyy-MM) — kaydın karşıladığı ay. */
  month: string;
  /** Ödeme tarihi / düzeltme kayıt tarihi. */
  date: string;
  amount: number;
  method?: string;
  note?: string;
  reversed: boolean;
  reverseReason?: string;
};

export type StatementMonthStatus = TeacherPayoutStatus | "not_created" | "no_lessons";

export type StatementMonth = {
  month: string;
  periodStart: string;
  periodEnd: string;
  status: StatementMonthStatus;
  payoutId?: string;
  lessons: number;
  makeups: number;
  clubSessions: number;
  minutes: number;
  /** Hesaplanan (dersler; satır düzeltmeleri dahil). */
  accrued: number;
  /** Ek/eksi düzeltmeler (ters kaydı olmayan). */
  adjustments: number;
  net: number;
  paid: number;
  balance: number;
  /** Kayıt ile güncel hesap farkı (bilgi; toplamlara girmez). */
  drift: number;
  missingFeeRule: number;
  lines: StatementLine[];
};

export type StatementTotals = Pick<
  StatementMonth,
  "lessons" | "makeups" | "clubSessions" | "minutes" | "accrued" | "adjustments" | "net" | "paid" | "balance" | "missingFeeRule"
>;

export type TeacherEarningsStatement = {
  teacherId: string;
  year: number;
  /** Aylık dökümde 1–12; yıllıkta undefined. */
  month?: number;
  months: StatementMonth[];
  totals: StatementTotals;
  ledger: StatementLedgerEntry[];
  /** Takvim ayıyla birebir örtüşmeyen (özel dönemli) aktif kayıtlar — döküme otomatik katılmaz, uyarı olarak gösterilir. */
  irregularPayouts: { id: string; periodStart: string; periodEnd: string }[];
};

const pad = (n: number) => String(n).padStart(2, "0");

export function statementMonthPeriod(year: number, month: number): { periodStart: string; periodEnd: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { periodStart: `${year}-${pad(month)}-01`, periodEnd: `${year}-${pad(month)}-${pad(last)}` };
}

function lineKind(lesson: Lesson | undefined, line: RevisedEarningsLine): StatementLineKind {
  if (lesson?.type === "group" || (!lesson && line.studentName === "Kulüp oturumu")) return "club";
  if (lesson?.type === "makeup" || lesson?.makeupRequestId) return "makeup";
  if (lesson?.type === "trial") return "trial";
  return "lesson";
}

function payoutEntries(p: TeacherPayout, month: string): StatementLedgerEntry[] {
  const payments: StatementLedgerEntry[] = p.payments
    ? p.payments.map((x) => ({
        type: "payment",
        id: x.id,
        month,
        date: x.paidAt,
        amount: x.amount,
        method: x.method,
        note: x.note,
        reversed: Boolean(x.reversedAt),
        reverseReason: x.reverseReason,
      }))
    : p.status === "paid"
      ? [{ type: "payment", id: `legacy-${p.id}`, month, date: p.paidAt ?? p.generatedAt, amount: p.totalAmount, method: p.method, note: "Eski kayıt (tek ödeme)", reversed: false }]
      : [];
  const adjustments: StatementLedgerEntry[] = (p.adjustments ?? []).map((a) => ({
    type: "adjustment",
    id: a.id,
    month,
    date: a.createdAt,
    amount: a.amount,
    note: `${a.kind === "recalc" ? "Hesap farkı" : "Düzeltme"}: ${a.reason}`,
    reversed: Boolean(a.reversedAt),
    reverseReason: a.reverseReason,
  }));
  return [...payments, ...adjustments];
}

/**
 * Döküm hesabı (saf). `month` verilirse yalnız o ay, verilmezse yılın 12 ayı (boş aylar dahil).
 * `data` en az dökümün yılını (±2 gün) kapsayan hakediş penceresi olmalıdır.
 */
export function buildTeacherEarningsStatement(
  data: PayoutLedgerData,
  teacherId: string,
  year: number,
  month?: number,
  now: Date = new Date()
): TeacherEarningsStatement {
  const lessonsById = new Map(data.lessons.map((l) => [l.id, l]));
  const monthNumbers = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const teacherPayouts = data.teacherPayouts.filter((p) => p.teacherId === teacherId && p.status !== "cancelled");
  const months: StatementMonth[] = [];
  const ledger: StatementLedgerEntry[] = [];

  for (const m of monthNumbers) {
    const { periodStart, periodEnd } = statementMonthPeriod(year, m);
    const key = `${year}-${pad(m)}`;
    const payout = teacherPayouts.find(
      (p) => payoutPeriodDayKey(p.periodStart) === periodStart && payoutPeriodDayKey(p.periodEnd) === periodEnd
    );
    const base = payout ? payoutBaseEarnings(data, payout) : computeTeacherEarningsForPeriod(data, teacherId, periodStart, periodEnd);
    const shown = applyPayoutLineOverrides(base, payout?.lineOverrides);
    const lines: StatementLine[] = shown.lines
      .map((l) => {
        const lesson = lessonsById.get(l.lessonId);
        return { ...l, kind: lineKind(lesson, l), attendedPlannedMakeup: lesson ? isAttendedPlannedMakeup(lesson, now) : false };
      })
      .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate) || a.lessonId.localeCompare(b.lessonId));

    const accrued = payout ? round2(payout.totalAmount) : round2(shown.totalAmount);
    const adjustments = payout ? payoutAdjustmentTotal(payout) : 0;
    const net = payout ? payoutNetAmount(payout) : accrued;
    const paid = payout ? payoutPaidAmount(payout) : 0;
    months.push({
      month: key,
      periodStart,
      periodEnd,
      status: payout ? payout.status : lines.length > 0 ? "not_created" : "no_lessons",
      payoutId: payout?.id,
      lessons: lines.length,
      makeups: lines.filter((l) => l.kind === "makeup").length,
      clubSessions: lines.filter((l) => l.kind === "club").length,
      minutes: shown.totalMinutes,
      accrued,
      adjustments,
      net,
      paid,
      balance: payout ? payoutBalance(payout) : net,
      drift: payout ? payoutDrift(data, payout) : 0,
      missingFeeRule: lines.filter((l) => l.issue === "missing-fee-rule").length,
      lines,
    });
    if (payout) ledger.push(...payoutEntries(payout, key));
  }

  const sum = (pick: (m: StatementMonth) => number) => round2(months.reduce((s, m) => s + pick(m), 0));
  const totals: StatementTotals = {
    lessons: months.reduce((s, m) => s + m.lessons, 0),
    makeups: months.reduce((s, m) => s + m.makeups, 0),
    clubSessions: months.reduce((s, m) => s + m.clubSessions, 0),
    minutes: months.reduce((s, m) => s + m.minutes, 0),
    accrued: sum((m) => m.accrued),
    adjustments: sum((m) => m.adjustments),
    net: sum((m) => m.net),
    paid: sum((m) => m.paid),
    balance: sum((m) => m.balance),
    missingFeeRule: months.reduce((s, m) => s + m.missingFeeRule, 0),
  };

  const first = months[0]?.periodStart ?? `${year}-01-01`;
  const last = months[months.length - 1]?.periodEnd ?? `${year}-12-31`;
  const matched = new Set(months.map((m) => m.payoutId).filter(Boolean));
  const irregularPayouts = teacherPayouts
    .filter((p) => !matched.has(p.id))
    .filter((p) => payoutPeriodDayKey(p.periodStart) <= last && payoutPeriodDayKey(p.periodEnd) >= first)
    .map((p) => ({ id: p.id, periodStart: payoutPeriodDayKey(p.periodStart), periodEnd: payoutPeriodDayKey(p.periodEnd) }));

  ledger.sort((a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date));
  return { teacherId, year, month, months, totals, ledger, irregularPayouts };
}
