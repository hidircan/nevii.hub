/**
 * 9. tur (2026-09-27) — Ödemeler ekranının KAPSAM kuralı, tek kaynak.
 *
 * Kök neden: "Tahsil edilen / Bekleyen / Gecikmiş" kartları `data.payments`'ın
 * TAMAMINDAN hesaplanıyordu — aktif, pasif (ayrılmış) ve silinmiş öğrencilerin
 * satırları tek toplamda karışıyor, ekran bunu hiç söylemiyordu.
 *
 * Kurallar (hiçbiri Payment satırını DEĞİŞTİRMEZ, yalnız sınıflandırır):
 *  - Kapsam, öğrencinin BUGÜNKÜ durumundan okunur (`active !== false` ve
 *    silinmemiş = aktif). Öğrenci pasife alınınca satırları silinmez,
 *    yeniden hesaplanmaz; yalnız "Pasif" görünümüne geçer. Aktife dönünce geri gelir.
 *  - Öğrencisi bulunamayan satır (eski/taşınmış kayıt) pasif sayılır — kaybolmaz.
 *  - Açık alacak = `isLiveObligation` (payment-profile.ts, TEK canlı borç kuralı):
 *    ödenmiş, iptal edilmiş (voided) ve iptal/yenilenmiş sözleşmenin ödenmemiş
 *    taksitleri borç sayılmaz. Tutar = kalan (amount − paidAmount).
 *  - Tahsil edilen = `collectedAmountOf` (payment-profile.ts, TEK tanım):
 *    fiilen alınan para, kısmi ödemenin alınan kısmı DAHİL; kalan bakiye açık
 *    alacakta ayrıca görünür. Finans Özeti ve Günlük Özet aynı fonksiyonu kullanır.
 *  - Pasif öğrenciye hiçbir satır ÜRETİLMEZ; yalnız mevcut, belgelenmiş
 *    satırlar gösterilir.
 */
import { collectedAmountOf, isLiveObligation } from "./payment-profile";
import type { Payment, Student } from "./types";

export type PaymentScope = "aktif" | "pasif" | "tum";

export const PAYMENT_SCOPE_LABEL: Record<PaymentScope, string> = {
  aktif: "Aktif öğrenciler",
  pasif: "Pasif öğrenciler",
  tum: "Tüm kayıtlar",
};

export function parsePaymentScope(raw: string | undefined | null): PaymentScope {
  return raw === "pasif" || raw === "tum" ? raw : "aktif";
}

type ScopeStudent = Pick<Student, "id" | "active" | "deletedAt">;

export function isActiveStudent(student: ScopeStudent | undefined): boolean {
  return Boolean(student && student.active !== false && !student.deletedAt);
}

export function paymentInScope<P extends Pick<Payment, "studentId">>(
  payment: P,
  scope: PaymentScope,
  studentsById: ReadonlyMap<string, ScopeStudent>
): boolean {
  if (scope === "tum") return true;
  const active = isActiveStudent(studentsById.get(payment.studentId));
  return scope === "aktif" ? active : !active;
}

export type PaymentScopeTotals = {
  /** Kapsamdaki satır sayısı (iptal edilen "voided" satırlar dahil — listede görünürler). */
  rowCount: number;
  /** Kapsamdaki satırı olan tekil öğrenci. */
  studentCount: number;
  collected: number;
  /** Açık alacak — vadesi gelmiş/gelmemiş tüm canlı borcun kalanı. */
  outstanding: number;
  overdueAmount: number;
  overdueCount: number;
};

export function computePaymentScopeTotals(
  payments: Pick<Payment, "studentId" | "status" | "amount" | "paidAmount" | "contractId">[],
  terminalContractIds: ReadonlySet<string>
): PaymentScopeTotals {
  let collected = 0;
  let outstanding = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  for (const p of payments) {
    collected += collectedAmountOf(p);
    if (!isLiveObligation(p, terminalContractIds)) continue;
    const due = Math.max(p.amount - p.paidAmount, 0);
    outstanding += due;
    if (p.status === "overdue") {
      overdueAmount += due;
      overdueCount += 1;
    }
  }
  return {
    rowCount: payments.length,
    studentCount: new Set(payments.map((p) => p.studentId)).size,
    collected,
    outstanding,
    overdueAmount,
    overdueCount,
  };
}

/** Kapsama göre satırları ve toplamları TEK geçişte ayırır — kartlar ve tablo aynı listeden beslenir. */
export function scopePayments<P extends Pick<Payment, "studentId" | "status" | "amount" | "paidAmount" | "contractId">>(
  payments: P[],
  students: ScopeStudent[],
  scope: PaymentScope,
  terminalContractIds: ReadonlySet<string>
): { rows: P[]; totals: PaymentScopeTotals; counts: Record<PaymentScope, number> } {
  const byId = new Map(students.map((s) => [s.id, s]));
  const rows = payments.filter((p) => paymentInScope(p, scope, byId));
  const activeCount = payments.filter((p) => paymentInScope(p, "aktif", byId)).length;
  return {
    rows,
    totals: computePaymentScopeTotals(rows, terminalContractIds),
    counts: { aktif: activeCount, pasif: payments.length - activeCount, tum: payments.length },
  };
}
