import { describe, it, expect } from "vitest";
import { planUpcomingAccrualSync } from "../standalone-monthly-accrual";
import type { Payment, Student } from "../types";

const student = (id: string, p: Partial<Student> = {}): Student =>
  ({ id, name: id, active: true, monthlyFee: 7950, enrollmentStartDate: "2026-09-01", ...p }) as Student;
const plan = (id: string, studentId: string, p: Partial<Payment> = {}): Payment => ({
  id, studentId, amount: 7950, paidAmount: 0, status: "pending", source: "monthly_plan",
  dueDate: "2026-11-01T12:00:00.000Z", description: "Aylık plan — 2026-11 (7950 TL)", installmentPeriodLabel: "Kasım 2026", ...p,
});

describe("gelecek ay tahakkuku (2026-10-23 — sözleşmesiz öğrencide Kasım hiçbir ekranda yoktu)", () => {
  it("uygun öğrenciye gelecek ay yazılır; ücret değişince tutar, uygunluk bitince iptal; ödenmiş satıra dokunulmaz", () => {
    const r = planUpcomingAccrualSync({
      students: [student("new"), student("feeChanged", { monthlyFee: 8500 }), student("paused", { paymentPauseStatus: "paused" }), student("paid")],
      payments: [plan("f", "feeChanged"), plan("p", "paused"), plan("x", "paid", { paidAmount: 7950, status: "paid" })],
      contractStatusByStudent: new Map(),
      month: "2026-11",
    });
    expect(r.create).toEqual([{ studentId: "new", month: "2026-11", amount: 7950 }]);
    expect(r.reprice).toEqual([{ paymentId: "f", studentId: "feeChanged", amount: 8500 }]);
    expect(r.voidIds).toEqual(["p"]);
  });
});
