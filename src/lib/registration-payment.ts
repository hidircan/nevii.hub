/**
 * 2026-10-10 — kayıt anı ilk tahsilat satırının TEK kurucusu (saf; I/O yok).
 *
 * `store.registerStudent` (yeni öğrenci + tüm branşların ilk tahsilatı) ve `store.changeStudentEnrollments`
 * (mevcut öğrenciye branş + ilk tahsilatı) json/memory/db üçünde AYNI satırı üretsin diye burada toplanır.
 * Tahsilat BRANŞ başınadır: idempotency anahtarı (öğrenci, source, enrollmentId) — bkz. store-*.ts
 * `addRegistrationFirstPayment` ile birebir aynı.
 */
import type { Payment } from "./types";
import type { RegistrationFirstPaymentRecord } from "./student-enrollments";

export const REGISTRATION_FIRST_PAYMENT_SOURCE = "registration_first_payment" as const;

/** Açıklamaya eklenen dekont/not eki: " (ref:123 · not)". */
export function registrationFirstPaymentDescription(fp: Pick<RegistrationFirstPaymentRecord, "reference" | "note">): string {
  const suffix = fp.reference || fp.note ? ` (${[fp.reference && `ref:${fp.reference}`, fp.note].filter(Boolean).join(" · ")})` : "";
  return `İlk Ödeme — Kayıt Anında Tahsil Edildi${suffix}`;
}

/** json/memory için `Payment` satırı. db, aynı alanları Prisma `create` verisine kendisi eşler. */
export function buildRegistrationFirstPayment(
  id: string,
  studentId: string,
  fp: RegistrationFirstPaymentRecord,
  createdAt: string
): Payment {
  return {
    id,
    studentId,
    amount: fp.amount,
    paidAmount: fp.amount,
    status: "paid",
    dueDate: fp.collectedAt,
    paidAt: fp.collectedAt,
    description: registrationFirstPaymentDescription(fp),
    method: fp.method,
    source: REGISTRATION_FIRST_PAYMENT_SOURCE,
    receivedByUserId: fp.receivedByUserId,
    paymentNote: fp.note,
    createdAt,
    autoSuggestedAmount: fp.autoSuggestedAmount,
    adjustmentReason: fp.adjustmentReason,
    adjustedBy: fp.adjustedBy,
    adjustedAt: fp.adjustedAt,
    firstCollectionIncludesNextMonth: fp.firstCollectionIncludesNextMonth,
    enrollmentId: fp.enrollmentId,
    ...(fp.installmentPeriodLabel ? { installmentPeriodLabel: fp.installmentPeriodLabel } : {}),
    ...(fp.installmentBreakdown ? { installmentBreakdown: fp.installmentBreakdown } : {}),
  };
}

/** Bir öğrencinin ilk tahsilat satırlarının branş → ödeme kimliği haritası. */
export function registrationPaymentIdsByEnrollment(payments: Pick<Payment, "id" | "studentId" | "source" | "enrollmentId">[], studentId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of payments) {
    if (p.studentId === studentId && p.source === REGISTRATION_FIRST_PAYMENT_SOURCE && p.enrollmentId) out[p.enrollmentId] = p.id;
  }
  return out;
}
