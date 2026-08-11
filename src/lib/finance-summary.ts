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

import type { AppData } from "./types";
import type { PayrollRecord } from "./types";
import type { ExpenseRecord } from "./types";

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
  /** Şube bazlı personel maliyeti (yalnızca PayrollRecord — StaffMember.branchId üzerinden). */
  costByBranch: { branchId: string; branchName: string; amount: number }[];
  /** Son 6 ay gelir/gider trendi. */
  trend: { month: string; income: number; expense: number }[];
  upcomingPayrollWarnings: { staffId: string; staffName: string; month: string; status: string }[];
};

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function computeFinanceSummary(
  data: AppData,
  staff: { id: string; name: string; branchId?: string }[],
  payroll: PayrollRecord[],
  expenses: ExpenseRecord[],
  now: Date = new Date()
): FinanceSummary {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const payrollThisMonth = payroll.filter((p) => p.month === currentMonth && p.status !== "cancelled");
  const payrollPaidThisMonth = payrollThisMonth.filter((p) => p.status === "paid").reduce((s, p) => s + p.netAmount, 0);
  const payrollPendingThisMonth = payrollThisMonth
    .filter((p) => p.status !== "paid")
    .reduce((s, p) => s + p.netAmount, 0);
  const payrollCostThisMonth = payrollPaidThisMonth + payrollPendingThisMonth;

  const teacherPayoutTotalThisMonth = (data.teacherPayouts ?? [])
    .filter((p) => monthKey(p.periodStart) === currentMonth)
    .reduce((s, p) => s + p.totalAmount, 0);

  const paymentsThisMonth = data.payments.filter((p) => monthKey(p.dueDate) === currentMonth);
  const studentPaymentsCollectedThisMonth = paymentsThisMonth
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.paidAmount, 0);
  const studentPaymentsPendingThisMonth = paymentsThisMonth
    .filter((p) => p.status !== "paid" && p.status !== "voided")
    .reduce((s, p) => s + (p.amount - p.paidAmount), 0);

  const expensesThisMonth = expenses.filter((e) => monthKey(e.date) === currentMonth);
  const expenseTotalThisMonth = expensesThisMonth.reduce((s, e) => s + e.amount, 0);

  const teacherPayoutPaidThisMonth = (data.teacherPayouts ?? [])
    .filter((p) => monthKey(p.periodStart) === currentMonth && p.status === "paid")
    .reduce((s, p) => s + p.totalAmount, 0);

  const totalExpenseThisMonth = payrollPaidThisMonth + teacherPayoutPaidThisMonth + expenseTotalThisMonth;
  const netCashThisMonth = studentPaymentsCollectedThisMonth - totalExpenseThisMonth;

  const branchMap = new Map(data.settings.branches.map((b) => [b.id, b.shortName]));
  const costByBranchMap = new Map<string, number>();
  for (const p of payrollThisMonth) {
    const s = staff.find((st) => st.id === p.staffId);
    if (!s?.branchId) continue;
    costByBranchMap.set(s.branchId, (costByBranchMap.get(s.branchId) ?? 0) + p.netAmount);
  }
  const costByBranch = Array.from(costByBranchMap.entries()).map(([branchId, amount]) => ({
    branchId,
    branchName: branchMap.get(branchId) ?? branchId,
    amount,
  }));

  const trend: { month: string; income: number; expense: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const income = data.payments
      .filter((p) => monthKey(p.dueDate) === key && p.status === "paid")
      .reduce((s, p) => s + p.paidAmount, 0);
    const expense =
      payroll.filter((p) => p.month === key && p.status === "paid").reduce((s, p) => s + p.netAmount, 0) +
      (data.teacherPayouts ?? [])
        .filter((p) => monthKey(p.periodStart) === key && p.status === "paid")
        .reduce((s, p) => s + p.totalAmount, 0) +
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
  };
}
