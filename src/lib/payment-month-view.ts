/**
 * 2026-10-20 — Ödemeler ekranının AY görünümü (saf; I/O yok, sunucuda çalışır).
 *
 * AY KURALI: bir ödeme satırı, Yoklama Takvimi ay kutusuyla AYNI kuraldan (`installmentMonthShares`) dönem ayına
 * düşer — dönem etiketi/kırılımı, sözleşmesiz planın seçilen ayı, yoksa vade ayı. Tahsilat tarihi ayı belirlemez.
 * Çok aylı tek satır (birleşik ilk tahsilat) her ayda yalnız o aya düşen payıyla görünür; aynı para iki ayda sayılmaz.
 * DURUM: `resolvePaymentDisplayStatus` (payments/status.ts) o ayın payına uygulanır — liste, filtre ve özet aynı
 * kaynaktan. İptal edilmiş satır ve iptal/yenilenmiş sözleşmenin ödenmemiş taksiti aylık beklentiye girmez.
 */
import { contractInstallmentProgressDescription, contractOwnInstallmentMonths, coveredInstallmentCount, installmentMonthShares, isStaleUnsplitShare } from "./attendance-calendar-plan";
import { resolvePaymentDisplayStatus, remainingAmount, type PaymentDisplayStatus } from "./payments/status";
import type { PaymentListRow } from "./reference-data";
import { normalizePaymentMethodEnum } from "./utils";

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
  /**
   * Seçili aya düşen tahsilat paylarının ödeme türüne göre toplamı — Ödemeler
   * ekranının üst özeti buradan beslenir (tek kaynak). Bilinmeyen/boş yöntem
   * `other` altında toplanır; tahsilatın hangi ayda sayılacağı kuralı
   * `buildPaymentMonthView` ile aynıdır (dönem ayı; tahsilat tarihi değil).
   */
  collectedByMethod: MethodCollectionTotals;
};

/** Seçili ayda tahsil edilen tutarın yöntem kırılımı (kurumsal etiketler `paymentMethodLabelTr` ile ekranda). */
export type MethodCollectionTotals = {
  cash: number;
  transfer: number;
  credit_card: number;
  other: number;
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
  const ownMonths = contractOwnInstallmentMonths(payments);
  for (const p of payments) {
    const shares = installmentMonthShares(p);
    const coveredInstallments = coveredInstallmentCount(p, ownMonths);
    for (const share of shares) {
      if (share.month > opts.month) continue;
      // Sözleşmenin o ay için kendi taksiti var: önceki satırın bayat "takip eden ay" payı ayrı satır olarak gösterilmez.
      if (isStaleUnsplitShare(p, share, ownMonths)) continue;
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
          ? `${contractInstallmentProgressDescription(p, ownMonths)} · ${share.periodLabel}`
          : contractInstallmentProgressDescription(p, ownMonths),
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
  const collectedByMethod: MethodCollectionTotals = { cash: 0, transfer: 0, credit_card: 0, other: 0 };
  for (const r of rows) {
    const key = normalizePaymentMethodEnum(r.method) ?? "other";
    collectedByMethod[key] += r.collected;
  }
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
      collectedByMethod,
    },
    carryover: carryover.sort(byDue),
    carryoverTotal: sum(carryover, (r) => r.remaining),
    excludedCount,
  };
}

/**
 * Öğrenci bağlamında açık borç satırları — TEK kurucu.
 * `/panel/odemeler/[studentId]` (kanonik öğrenci ödeme ekranı) ile
 * `/panel/ogrenciler/[studentId]/odemeler` (öğrenci içi sekme) AYNI satırları
 * `PaymentsMonthBoard` ile gösterir; durum/etiket/para kuralı ay panosuyla
 * aynıdır (`resolvePaymentDisplayStatus`, kalan = tutar − alınan).
 * Çağıran, branş filtresi uygulanmış AÇIK borç listesini verir
 * (`splitStudentDebt(...).open`); sıralama ve satır biçimi burada teklenir.
 */
export function buildStudentOpenDebtRows(
  openPayments: readonly PaymentListRow[],
  opts: {
    studentName: string;
    todayYmd: string;
    terminalContractIds: ReadonlySet<string>;
    branchLabel?: (p: PaymentListRow) => string | undefined;
  }
): MonthPaymentRow[] {
  return openPayments
    .map((p) => ({
      id: p.id,
      studentId: p.studentId,
      studentName: opts.studentName,
      branchLabel: opts.branchLabel?.(p),
      description: p.installmentPeriodLabel ?? contractInstallmentProgressDescription(p),
      expected: p.amount,
      collected: p.paidAmount,
      remaining: remainingAmount(p.amount, p.paidAmount),
      rowAmount: p.amount,
      rowPaidAmount: p.paidAmount,
      spansMonths: false,
      coveredInstallments: coveredInstallmentCount(p),
      dueDate: p.dueDate,
      status: resolvePaymentDisplayStatus(p, opts.terminalContractIds, opts.todayYmd),
      month: p.dueDate.slice(0, 7),
      method: p.method,
      paidAt: p.paidAt,
      paymentNote: p.paymentNote,
      source: p.source,
      lessonId: p.lessonId,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName, "tr"));
}
