/**
 * İş 3D — Kurum sahibi mali dashboard'u. "Gelir" ve "gider" TEK kaynaktan
 * hesaplanır, hiçbir sayı burada TAHMİN EDİLMEZ:
 *   Gelir  = Payment.paidAmount toplamı (status="paid" olan ödemeler —
 *            AYNI kaynak Ödemeler ekranıyla).
 *   Gider  = ödenmiş PayrollRecord.netAmount + ödenmiş TeacherPayout.totalAmount
 *            + ExpenseRecord.amount (kira/fatura/sarf/diğer — bkz. expense.ts).
 * Bordro/hakedişi TAHAKKUK (approved ama henüz ödenmemiş) ile TAHSİLAT
 * (paid) ayrımı UI'da açıkça etiketlenir — "bekleyen" ve "ödenen" hiçbir
 * zaman tek bir toplamda karıştırılmaz.
 *
 * Henüz hiç ExpenseRecord girilmemişse toplam gider EKSİKTİR — dashboard
 * bunu sessizce "0" olarak göstermez, açık bir "veri eksik" notu render
 * eder (bkz. FinanceSummary.expenseDataIncomplete).
 */

import { payoutNetAmount, payoutPaidAmount } from "./payout-ledger";
import { collectedAmountOf } from "./payment-profile";
import type { AppData, ContractStatus } from "./types";
import { isPlanEligibleContractStatus } from "./attendance-calendar-plan";
import type { PayrollRecord } from "./types";
import type { ExpenseRecord, ExpenseCategory, Budget } from "./types";

export type FinanceSummary = {
  month: string; // yyyy-MM — "bu ay"
  payrollCostThisMonth: number;
  payrollPaidThisMonth: number;
  payrollPendingThisMonth: number;
  teacherPayoutTotalThisMonth: number;
  studentPaymentsCollectedThisMonth: number;
  studentPaymentsPendingThisMonth: number;
  totalExpenseThisMonth: number;
  netCashThisMonth: number;
  /** ExpenseRecord hiç girilmemişse true — "toplam gider" rakamı eksik olabilir. */
  expenseDataIncomplete: boolean;
  /** Şube bazlı toplam maliyet (bu ay) — PayrollRecord + ExpenseRecord.branchId birleşik. */
  costByBranch: { branchId: string; branchName: string; amount: number }[];
  /** Son 6 ay gelir/gider trendi. */
  trend: { month: string; income: number; expense: number }[];
  upcomingPayrollWarnings: { staffId: string; staffName: string; month: string; status: string }[];
  /** Faz 10 — bu ayki giderlerin kategori kırılımı. */
  expenseByCategory: { category: ExpenseCategory; amount: number }[];
  /**
   * Faz 10 — ödenmemiş, `dueDate`si olan giderler (yaklaşan + geciken).
   * "overdue" burada hiçbir zaman kalıcı bir DB değeri değil — `dueDate`
   * karşısında OKUMA anında türetilir (bkz. expense.ts dosya başı notu).
   */
  upcomingExpenseWarnings: {
    expenseId: string;
    category: ExpenseCategory;
    amount: number;
    dueDate: string;
    status: "pending" | "overdue";
  }[];
  /** Faz 10 — bu ayki bütçe hedefleri vs gerçekleşen gider. */
  budgetComparison: {
    category: ExpenseCategory;
    branchId?: string;
    branchName?: string;
    targetAmount: number;
    actualAmount: number;
  }[];
};

/** "paid" dışında hiçbir zaman kalıcı yazılmaz — bkz. expense.ts. */
export function effectiveExpensePaymentStatus(e: Pick<ExpenseRecord, "paymentStatus" | "dueDate">, now: Date): "pending" | "paid" | "overdue" {
  const stored = e.paymentStatus ?? "paid";
  if (stored === "paid") return "paid";
  if (e.dueDate && new Date(e.dueDate) < now) return "overdue";
  return "pending";
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function computeFinanceSummary(
  data: Pick<AppData, "settings" | "payments" | "teacherPayouts">,
  staff: { id: string; name: string; branchId?: string }[],
  payroll: PayrollRecord[],
  expenses: ExpenseRecord[],
  now: Date = new Date(),
  budgets: Budget[] = [],
  /**
   * 10. tur iş #6 — ay seçimi. Geçerli `yyyy-MM` ise özet o aya göre
   * üretilir (trend: seçili ayda BİTEN son 6 ay); geçersizse bugünün ayı.
   * Gecikme türetimi (`upcomingExpenseWarnings`) her zaman OKUMA anına
   * (`now`) göredir — geçmiş ay seçimi gecikmeyi yeniden yazmaz.
   */
  monthOverride?: string
): FinanceSummary {
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthOverride ?? "") ? monthOverride! : nowMonth;

  const payrollThisMonth = payroll.filter((p) => p.month === currentMonth && p.status !== "cancelled");
  const payrollPaidThisMonth = payrollThisMonth.filter((p) => p.status === "paid").reduce((s, p) => s + p.netAmount, 0);
  const payrollPendingThisMonth = payrollThisMonth
    .filter((p) => p.status !== "paid")
    .reduce((s, p) => s + p.netAmount, 0);
  const payrollCostThisMonth = payrollPaidThisMonth + payrollPendingThisMonth;

  const teacherPayoutTotalThisMonth = (data.teacherPayouts ?? [])
    .filter((p) => monthKey(p.periodStart) === currentMonth && p.status !== "cancelled")
    .reduce((s, p) => s + payoutNetAmount(p), 0);

  const paymentsThisMonth = data.payments.filter((p) => monthKey(p.dueDate) === currentMonth);
  // Kısmi ödemenin alınan kısmı dahil — TEK tanım collectedAmountOf (payment-profile.ts).
  const studentPaymentsCollectedThisMonth = paymentsThisMonth.reduce((s, p) => s + collectedAmountOf(p), 0);
  const studentPaymentsPendingThisMonth = paymentsThisMonth
    .filter((p) => p.status !== "paid" && p.status !== "voided")
    .reduce((s, p) => s + (p.amount - p.paidAmount), 0);

  const expensesThisMonth = expenses.filter((e) => monthKey(e.date) === currentMonth);
  const expenseTotalThisMonth = expensesThisMonth.reduce((s, e) => s + e.amount, 0);

  const teacherPayoutPaidThisMonth = (data.teacherPayouts ?? [])
    .filter((p) => monthKey(p.periodStart) === currentMonth)
    .reduce((s, p) => s + payoutPaidAmount(p), 0);

  const totalExpenseThisMonth = payrollPaidThisMonth + teacherPayoutPaidThisMonth + expenseTotalThisMonth;
  const netCashThisMonth = studentPaymentsCollectedThisMonth - totalExpenseThisMonth;

  const branchMap = new Map(data.settings.branches.map((b) => [b.id, b.shortName]));
  const costByBranchMap = new Map<string, number>();
  for (const p of payrollThisMonth) {
    const s = staff.find((st) => st.id === p.staffId);
    if (!s?.branchId) continue;
    costByBranchMap.set(s.branchId, (costByBranchMap.get(s.branchId) ?? 0) + p.netAmount);
  }
  // Faz 10 — ExpenseRecord.branchId ile zenginleştirme (yalnızca bordro değil, bu ayki giderler de dahil).
  for (const e of expensesThisMonth) {
    if (!e.branchId) continue;
    costByBranchMap.set(e.branchId, (costByBranchMap.get(e.branchId) ?? 0) + e.amount);
  }
  const costByBranch = Array.from(costByBranchMap.entries()).map(([branchId, amount]) => ({
    branchId,
    branchName: branchMap.get(branchId) ?? branchId,
    amount,
  }));

  // Faz 10 — kategori kırılımı (bu ay).
  const expenseByCategoryMap = new Map<ExpenseCategory, number>();
  for (const e of expensesThisMonth) {
    expenseByCategoryMap.set(e.category, (expenseByCategoryMap.get(e.category) ?? 0) + e.amount);
  }
  const expenseByCategory = Array.from(expenseByCategoryMap.entries()).map(([category, amount]) => ({ category, amount }));

  // Faz 10 — yaklaşan/geciken ödemeler (dueDate varsa VE henüz ödenmemişse).
  const upcomingExpenseWarnings = expenses
    .filter((e) => e.dueDate)
    .map((e) => ({ e, status: effectiveExpensePaymentStatus(e, now) }))
    .filter((x): x is { e: ExpenseRecord; status: "pending" | "overdue" } => x.status !== "paid")
    .sort((a, b) => a.e.dueDate!.localeCompare(b.e.dueDate!))
    .map(({ e, status }) => ({ expenseId: e.id, category: e.category, amount: e.amount, dueDate: e.dueDate!, status }));

  // Faz 10 — bu ayki bütçe hedefleri vs gerçekleşen.
  const budgetComparison = budgets
    .filter((b) => b.period === currentMonth)
    .map((b) => {
      const actualAmount = expensesThisMonth
        .filter((e) => e.category === b.category && (!b.branchId || e.branchId === b.branchId))
        .reduce((s, e) => s + e.amount, 0);
      return {
        category: b.category,
        branchId: b.branchId,
        branchName: b.branchId ? (branchMap.get(b.branchId) ?? b.branchId) : undefined,
        targetAmount: b.targetAmount,
        actualAmount,
      };
    });

  const trend: { month: string; income: number; expense: number }[] = [];
  const [baseYear, baseMonth] = currentMonth.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(baseYear!, baseMonth! - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const income = data.payments
      .filter((p) => monthKey(p.dueDate) === key && p.status === "paid")
      .reduce((s, p) => s + p.paidAmount, 0);
    const expense =
      payroll.filter((p) => p.month === key && p.status === "paid").reduce((s, p) => s + p.netAmount, 0) +
      (data.teacherPayouts ?? [])
        .filter((p) => monthKey(p.periodStart) === key)
        .reduce((s, p) => s + payoutPaidAmount(p), 0) +
      expenses.filter((e) => monthKey(e.date) === key).reduce((s, e) => s + e.amount, 0);
    trend.push({ month: key, income, expense });
  }

  const upcomingPayrollWarnings = payroll
    .filter((p) => p.status === "pending_approval" || p.status === "approved")
    .map((p) => ({
      staffId: p.staffId,
      staffName: staff.find((s) => s.id === p.staffId)?.name ?? p.staffId,
      month: p.month,
      status: p.status,
    }));

  return {
    month: currentMonth,
    payrollCostThisMonth,
    payrollPaidThisMonth,
    payrollPendingThisMonth,
    teacherPayoutTotalThisMonth,
    studentPaymentsCollectedThisMonth,
    studentPaymentsPendingThisMonth,
    totalExpenseThisMonth,
    netCashThisMonth,
    expenseDataIncomplete: expenses.length === 0,
    costByBranch,
    trend,
    upcomingPayrollWarnings,
    expenseByCategory,
    upcomingExpenseWarnings,
    budgetComparison,
  };
}

/**
 * UAT 2026-09-24 (C) — "Öğrenci başına ortalama ücret".
 * Pay: seçili ayı kapsayan, ödeme kaynağı olabilen (taslak/iptal/yenilenmiş
 * DEĞİL) GÜNCEL sözleşmelerin aylık ücreti (`monthlyAmount`). Payda: bu
 * sözleşmelere sahip tekil öğrenci. Sözleşme toplam bedeli, süre, taksit ve
 * ders sayısına göre değişen ay tutarı bilinçli olarak KULLANILMAZ — farklı
 * süreli sözleşmeler ancak aylık birim ücretle karşılaştırılabilir. Öğrenci
 * başına tek güncel sözleşme (`listContractSummariesByStudent` kuralı) olduğu
 * için yenilenmiş/iptal sözleşme ikinci kez sayılmaz. Payda 0 → `average: null`.
 */
export function computeAverageMonthlyFeePerStudent(input: {
  /** 2026-10-09 — çok branşlı öğrencide branş başına güncel sözleşme (`enrollmentId`); öğrencinin ücreti branşların toplamıdır. */
  contracts: Iterable<{ studentId: string; status: string; enrollmentStartDate: string; enrollmentEndDate: string; monthlyAmount: number; enrollmentId?: string }>;
  students: { id: string; branchId: string; deletedAt?: string }[];
  month: string; // yyyy-MM
  branchId?: string;
}): { average: number | null; studentCount: number; totalMonthly: number; studentIds: string[] } {
  const studentBranch = new Map(input.students.filter((s) => !s.deletedAt).map((s) => [s.id, s.branchId]));
  const counted = new Set<string>();
  const countedBranches = new Set<string>();
  let totalMonthly = 0;
  for (const c of input.contracts) {
    const branch = studentBranch.get(c.studentId);
    if (branch === undefined || (input.branchId && branch !== input.branchId)) continue;
    if (!isPlanEligibleContractStatus(c.status as ContractStatus)) continue;
    if (c.enrollmentStartDate.slice(0, 7) > input.month || c.enrollmentEndDate.slice(0, 7) < input.month) continue;
    // Öğrenci paydada BİR kez; aynı branş ikinci kez toplanmaz, farklı branşların ücreti toplanır.
    const branchKey = `${c.studentId}:${c.enrollmentId ?? ""}`;
    if (countedBranches.has(branchKey)) continue;
    countedBranches.add(branchKey);
    counted.add(c.studentId);
    totalMonthly += c.monthlyAmount;
  }
  return {
    average: counted.size > 0 ? Math.round(totalMonthly / counted.size) : null,
    studentCount: counted.size,
    totalMonthly,
    // 10. tur iş #6 — aynı payda, tahsilat ortalamasında yeniden kullanılır.
    studentIds: [...counted].sort(),
  };
}

export type AverageFeeContractLike = {
  studentId: string;
  status: string;
  enrollmentStartDate: string;
  enrollmentEndDate: string;
  monthlyAmount: number;
  enrollmentId?: string;
};

/**
 * 10. tur iş #6 — "öğrenci başına ortalama TAHSİLAT" (ücret ortalamasından
 * FARKLI etikettir). Pay: paydadaki öğrencilerin o ay vadesi gelen
 * ödemelerinden FİİLEN tahsil edilen (`collectedAmountOf`: kısmi dahil,
 * voided hariç). Payda: ücret ortalamasıyla AYNI sözleşmeli-öğrenci kümesi
 * (tutarlı karşılaştırma; borcunu başka ay ödeyenler/paydasız tahsilatlar
 * bu metriğe girmez — aylık tahsilat oranı grafiği o resmi verir).
 * İade kaydı modeli YOKTUR (sınırlama: iade, ödemenin voided/paidAmount
 * düzeltmesiyle izlenir).
 */
export function computeAverageCollectedPerStudent(input: {
  payments: { studentId: string; dueDate: string; status: string; amount: number; paidAmount: number }[];
  studentIds: readonly string[];
  month: string; // yyyy-MM
}): { average: number | null; collectedTotal: number; studentCount: number } {
  const inScope = new Set(input.studentIds);
  let collectedTotal = 0;
  for (const p of input.payments) {
    if (!inScope.has(p.studentId)) continue;
    if (p.dueDate.slice(0, 7) !== input.month) continue;
    collectedTotal += collectedAmountOf(p as Parameters<typeof collectedAmountOf>[0]);
  }
  return {
    average: inScope.size > 0 ? Math.round(collectedTotal / inScope.size) : null,
    collectedTotal,
    studentCount: inScope.size,
  };
}

export type AverageFeeTrendPoint = {
  month: string;
  average: number | null;
  collectedAverage: number | null;
  studentCount: number;
};

/**
 * 10. tur iş #6 — verilen aylar için ücret + tahsilat ortalaması trendi.
 * Her ay BAĞIMSIZ hesaplanır (o ayı kapsayan sözleşmeler) — geçmiş aylar
 * bugünkü aktif/pasif durumdan ETKİLENMEZ (sözleşme tarih aralığı esastır).
 */
export function computeAverageFeeTrend(input: {
  contracts: AverageFeeContractLike[];
  students: { id: string; branchId: string; deletedAt?: string }[];
  payments: { studentId: string; dueDate: string; status: string; amount: number; paidAmount: number }[];
  months: string[];
  branchId?: string;
}): AverageFeeTrendPoint[] {
  return input.months.map((month) => {
    const fee = computeAverageMonthlyFeePerStudent({
      contracts: input.contracts,
      students: input.students,
      month,
      branchId: input.branchId,
    });
    const collected = computeAverageCollectedPerStudent({
      payments: input.payments,
      studentIds: fee.studentIds,
      month,
    });
    return { month, average: fee.average, collectedAverage: collected.average, studentCount: fee.studentCount };
  });
}
