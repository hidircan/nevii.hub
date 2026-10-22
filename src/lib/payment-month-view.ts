/**
 * 2026-10-20 — Ödemeler ekranının AY görünümü (saf; I/O yok, sunucuda çalışır).
 *
 * AY KURALI: bir ödeme satırı, Yoklama Takvimi ay kutusuyla AYNI kuraldan (`installmentMonthShares`) dönem ayına
 * düşer — dönem etiketi/kırılımı, sözleşmesiz planın seçilen ayı, yoksa vade ayı. Tahsilat tarihi ayı belirlemez.
 * Çok aylı tek satır (birleşik ilk tahsilat) her ayda yalnız o aya düşen payıyla görünür; aynı para iki ayda sayılmaz.
 * DURUM: `resolvePaymentDisplayStatus` (payments/status.ts) o ayın payına uygulanır — liste, filtre ve özet aynı
 * kaynaktan. İptal edilmiş satır ve iptal/yenilenmiş sözleşmenin ödenmemiş taksiti aylık beklentiye girmez.
 */
import { contractInstallmentProgressDescription, coveredInstallmentCount, installmentMonthShares } from "./attendance-calendar-plan";
import { resolvePaymentDisplayStatus, remainingAmount, type PaymentDisplayStatus } from "./payments/status";
import type { PaymentListRow } from "./reference-data";

export type MonthPaymentRow = {
  id: string;
  studentId: string;
  studentName: string;
  branchLabel?: string;
  description: string;
  /** Bu aya düşen beklenen / alınan / kalan (çok aylı satırda yalnız bu ayın payı). */
  expected: number;
  collected: number;
  remaining: number;
  /** Satırın TAMAMI — tahsil et / düzelt satırın kendisine uygulanır. */
  rowAmount: number;
  rowPaidAmount: number;
  spansMonths: boolean;
  /** Satırın kapattığı dönem sayısı (ay payı başına değil, satırın tamamı). */
  coveredInstallments: number;
  dueDate: string;
  status: PaymentDisplayStatus;
  month: string;
  method?: string;
  paidAt?: string;
  paymentNote?: string;
  source?: string;
  lessonId?: string;
  receivedByName?: string;
};

export type MonthSummary = {
  expected: number;
  collected: number;
  remaining: number;
  overdue: number;
  upcoming: number;
  /** 0–100; beklenen 0 ise null. */
  collectionRate: number | null;
  studentCount: number;
};

export type PaymentMonthView = {
  month: string;
  rows: MonthPaymentRow[];
  summary: MonthSummary;
  /** Önceki aylardan devreden gecikmiş satırlar (ayrı filtre). */
  carryover: MonthPaymentRow[];
  carryoverTotal: number;
  /** Bu aya düşen ama borç sayılmayan satır sayısı (iptal / kapanan sözleşme). */
  excludedCount: number;
};

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthParam(raw: string | undefined | null, fallback: string): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;
}

export function buildPaymentMonthView(
  payments: readonly PaymentListRow[],
  opts: {
    month: string;
    todayYmd: string;
    terminalContractIds: ReadonlySet<string>;
    studentName: (studentId: string) => string;
    branchLabel?: (p: PaymentListRow) => string | undefined;
    receivedByName?: (p: PaymentListRow) => string | undefined;
  }
): PaymentMonthView {
  const rows: MonthPaymentRow[] = [];
  const carryover: MonthPaymentRow[] = [];
  let excludedCount = 0;
  for (const p of payments) {
    const shares = installmentMonthShares(p);
    const coveredInstallments = coveredInstallmentCount(p);
    for (const share of shares) {
      if (share.month > opts.month) continue;
      if (share.month < opts.month && p.status === "paid") continue;
      const status = resolvePaymentDisplayStatus(
        { status: p.status, contractId: p.contractId, amount: share.amount, paidAmount: share.paidAmount, dueDate: p.dueDate },
        opts.terminalContractIds,
        opts.todayYmd
      );
      if (share.month < opts.month && status !== "overdue") continue;
      if (status === "voided" || status === "closed") {
        if (share.month === opts.month) excludedCount += 1;
        continue;
      }
      const row: MonthPaymentRow = {
        id: p.id,
        studentId: p.studentId,
        studentName: opts.studentName(p.studentId),
        branchLabel: opts.branchLabel?.(p),
        description: share.periodLabel && shares.length > 1
          ? `${contractInstallmentProgressDescription(p)} · ${share.periodLabel}`
          : contractInstallmentProgressDescription(p),
        expected: share.amount,
        collected: share.paidAmount,
        remaining: remainingAmount(share.amount, share.paidAmount),
        rowAmount: p.amount,
        rowPaidAmount: p.paidAmount,
        spansMonths: shares.length > 1,
        coveredInstallments,
        dueDate: p.dueDate,
        status,
        month: share.month,
        method: p.method,
        paidAt: p.paidAt,
        paymentNote: p.paymentNote,
        source: p.source,
        lessonId: p.lessonId,
        receivedByName: opts.receivedByName?.(p),
      };
      (share.month === opts.month ? rows : carryover).push(row);
    }
  }
  const sum = (list: MonthPaymentRow[], pick: (r: MonthPaymentRow) => number) => list.reduce((s, r) => s + pick(r), 0);
  const expected = sum(rows, (r) => r.expected);
  const collected = sum(rows, (r) => r.collected);
  const byDue = (a: MonthPaymentRow, b: MonthPaymentRow) => a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName, "tr");
  return {
    month: opts.month,
    rows: rows.sort(byDue),
    summary: {
      expected,
      collected,
      remaining: sum(rows, (r) => r.remaining),
      overdue: sum(rows.filter((r) => r.status === "overdue"), (r) => r.remaining),
      upcoming: sum(rows.filter((r) => r.status === "upcoming"), (r) => r.remaining),
      collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : null,
      studentCount: new Set(rows.map((r) => r.studentId)).size,
    },
    carryover: carryover.sort(byDue),
    carryoverTotal: sum(carryover, (r) => r.remaining),
    excludedCount,
  };
}
