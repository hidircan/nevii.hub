/**
 * Öğrenci ödeme + yoklama dökümü — finansal veri YALNIZ sözleşme snapshot'ından.
 * Tutar yeniden hesaplanmaz (billableLessonCount / derivePerLessonAmount yok).
 */
import { resolveAppTimezone, zonedHm } from "./timezone";
import { resolveContractPlanForMonth, type CalendarMonthPlan } from "./attendance-calendar-plan";
import { resolveStatementMonthPaymentMethodLabel } from "./contract-payment-plan-view";
import { resolveLessonFinalStatus, type LessonFinalStatus } from "./lesson-live-status";
import { attendanceCalendarTermMonths } from "./attendance-calendar";
import { academicTermMonths, resolveAcademicTermDatesForAnchor, type AcademicTermDates } from "./academic-term-dates";
import type { AppData, StudentTermType } from "./types";
import type { CalendarPlanContract } from "./attendance-calendar-plan";

export const LESSON_STATUS_TEXT: Record<LessonFinalStatus, string> = {
  attended: "Geldi",
  processed: "İşlendi",
  makeup: "Telafi",
  cancelled: "İptal",
  planned: "Planlı",
};

export const PAYMENT_STATUS_TEXT: Record<string, string> = {
  pending: "Ödenmedi",
  overdue: "Ödenmedi",
  partial: "Kısmi ödendi",
  paid: "Ödendi",
  voided: "İptal",
};

export type StatementLessonRow = {
  date: string;
  startAt: string;
  /**
   * P1 revizyonu — yazdırma çıktısında tarih yanına ders saati + şube.
   * `time`: Europe/Istanbul zonlu HH:mm (bkz. timezone.ts zonedHm —
   * makine saatine göre kaymaz). `branchName`: dersin branchId'sinden
   * kısa ad; bulunamazsa undefined → görünüm "—" basar (uydurma YOK).
   */
  time: string;
  branchName?: string;
  status: LessonFinalStatus;
  statusText: string;
  teacherName?: string;
  instrument: string;
};

export type StatementMonthRow = {
  year: number;
  month: number;
  label: string;
  plan: CalendarMonthPlan;
  collectedAt?: string;
  collectionNote?: string;
  collectorName?: string;
  /** P0 revizyonu — sözleşmedeki "Ödeme Türü" sütunuyla AYNI helper'dan
   * (contract-payment-plan-view.ts) çözülen canlı yöntem etiketi. */
  paymentMethodLabel: string;
  lessons: StatementLessonRow[];
};

export type StudentPaymentAttendanceStatement = {
  studentName: string;
  institutionName: string;
  branchName: string;
  term: StudentTermType;
  termLabel: string;
  termStart: string;
  termEnd: string;
  contractNumber?: string;
  months: StatementMonthRow[];
};

const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function buildStudentPaymentAttendanceStatement(input: {
  data: AppData;
  studentId: string;
  term: StudentTermType;
  anchorYear: number;
  contracts: CalendarPlanContract[];
  collectorNames: Map<string, string>;
}): StudentPaymentAttendanceStatement | { error: string } {
  const student = input.data.students.find((s) => s.id === input.studentId);
  if (!student) return { error: "Öğrenci bulunamadı" };

  const stored = input.data.settings.academicTermDates as AcademicTermDates | undefined;
  const dates = resolveAcademicTermDatesForAnchor(stored ?? null, input.term, input.anchorYear);
  const monthList = stored
    ? academicTermMonths(input.term, input.anchorYear, stored)
    : attendanceCalendarTermMonths(input.term, input.anchorYear);

  const branch = input.data.settings.branches.find((b) => b.id === student.branchId);
  const termStart = input.term === "yaz" ? dates.yazStart : dates.guzStart;
  const termEnd = input.term === "yaz" ? dates.yazEnd : dates.guzEnd;
  const termLabel =
    input.term === "yaz" ? `${input.anchorYear} Yaz` : `${input.anchorYear}–${input.anchorYear + 1} Güz`;

  const studentPayments = input.data.payments.filter((p) => p.studentId === student.id);
  const months: StatementMonthRow[] = monthList.map((m) => {
    const plan = resolveContractPlanForMonth({
      contracts: input.contracts,
      installments: studentPayments,
      year: m.year,
      month: m.month,
    });
    const monthPrefix = `${m.year}-${String(m.month).padStart(2, "0")}`;
    const lessons: StatementLessonRow[] = input.data.lessons
      .filter((l) => l.studentId === student.id && l.startAt.slice(0, 7) === monthPrefix)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .map((l) => {
        const status = resolveLessonFinalStatus(l);
        const teacher = input.data.teachers.find((t) => t.id === l.teacherId);
        const lessonBranch = input.data.settings.branches.find((b) => b.id === l.branchId);
        return {
          date: l.startAt.slice(0, 10),
          startAt: l.startAt,
          time: zonedHm(new Date(l.startAt), resolveAppTimezone()),
          branchName: lessonBranch?.shortName,
          status,
          statusText: LESSON_STATUS_TEXT[status],
          teacherName: teacher?.name,
          instrument: l.instrument,
        };
      });

    let collectedAt: string | undefined;
    let collectionNote: string | undefined;
    let collectorName: string | undefined;
    if (plan.state === "ok") {
      const rows = studentPayments.filter((p) => plan.paymentIds.includes(p.id));
      const withPaid = rows.filter((p) => p.paidAt).sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));
      const last = withPaid[withPaid.length - 1];
      collectedAt = last?.paidAt;
      collectionNote = last?.paymentNote ?? rows.find((p) => p.paymentNote)?.paymentNote;
      const collectorId = last?.receivedByUserId ?? rows.find((p) => p.receivedByUserId)?.receivedByUserId;
      if (collectorId) {
        collectorName = input.collectorNames.get(collectorId) ?? "Pasif/silinmiş kullanıcı";
      }
    }
    const paymentMethodLabel =
      plan.state === "ok"
        ? resolveStatementMonthPaymentMethodLabel({ paymentIds: plan.paymentIds, payments: studentPayments })
        : "—";

    return {
      year: m.year,
      month: m.month,
      label: `${MONTH_LABELS[m.month - 1]} ${m.year}`,
      plan,
      collectedAt,
      collectionNote,
      collectorName,
      paymentMethodLabel,
      lessons,
    };
  });

  const contractNumber = months.map((m) => (m.plan.state === "ok" ? m.plan.contractNumber : undefined)).find(Boolean);

  return {
    studentName: student.name,
    institutionName: input.data.settings.name,
    branchName: branch?.name ?? branch?.shortName ?? "—",
    term: input.term,
    termLabel,
    termStart,
    termEnd,
    contractNumber,
    months,
  };
}
