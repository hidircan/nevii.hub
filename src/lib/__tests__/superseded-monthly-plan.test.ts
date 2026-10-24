import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeStudentPaymentSummary, splitStudentDebt, summarizeStudentDebt } from "../payment-profile";
import { subtractSupersededRemainders, supersededUncollectedMonthlyPlanIds } from "../superseded-monthly-plan";
import type { Payment } from "../types";

const row = (p: Partial<Payment> & Pick<Payment, "id">): Payment => ({
  studentId: "s",
  amount: 7950,
  paidAmount: 0,
  status: "pending",
  dueDate: "2026-10-05T12:00:00.000Z",
  description: "Aylık plan — 2026-10",
  source: "monthly_plan",
  ...p,
});

const contractRow = (p: Partial<Payment> = {}): Payment =>
  row({
    id: "c",
    source: "contract",
    contractId: "live",
    description: "Sözleşme taksiti 1/12",
    installmentPeriodLabel: "Ekim 2026",
    dueDate: "2026-10-05T12:00:00.000Z",
    ...p,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("supersededUncollectedMonthlyPlanIds", () => {
  it("aynı ayın tahsilatsız aylık planını açık borçtan düşer; tahsilat, başka ay, başka branş ve elle borç durur", () => {
    const payments = [
      row({ id: "dup" }),
      row({ id: "paid", status: "paid", paidAmount: 7950 }),
      row({ id: "partial", paidAmount: 100, status: "partial" }),
      row({ id: "other-month", description: "Aylık plan — 2026-11", dueDate: "2026-11-01T12:00:00.000Z" }),
      row({ id: "other-branch", enrollmentId: "e2" }),
      row({ id: "manual", source: "manual", description: "Elle borç" }),
      contractRow({ enrollmentId: "e1" }),
    ];
    const drop = supersededUncollectedMonthlyPlanIds(payments, new Set());
    expect([...drop]).toEqual(["dup"]);
    expect(summarizeStudentDebt(payments, new Set()).openTotal).toBe(7950 + 7850 + 7950 + 7950 + 7950);
    const view = splitStudentDebt(payments, new Set());
    expect(view.bySource.find((x) => x.key === "monthly_plan")?.openTotal).toBe(7850 + 7950 + 7950);
    const summary = computeStudentPaymentSummary(payments, [{ id: "live", status: "active" }]);
    expect(summary.remaining).toBe(summarizeStudentDebt(payments, new Set()).openTotal);
    expect(summary.totalCollected).toBe(7950 + 100);
  });

  it("iptal sözleşme taksidi aylık planı kapatmaz; iki branşta bağsız satır tahmin edilmez", () => {
    const cancelled = [
      row({ id: "m" }),
      contractRow({ contractId: "dead" }),
    ];
    expect(supersededUncollectedMonthlyPlanIds(cancelled, new Set(["dead"])).size).toBe(0);
    expect(summarizeStudentDebt(cancelled, new Set(["dead"])).openTotal).toBe(7950);

    const ambiguous = [
      row({ id: "loose" }),
      contractRow({ id: "a", enrollmentId: "e1", installmentPeriodLabel: "Ekim 2026" }),
      contractRow({ id: "b", contractId: "live-2", enrollmentId: "e2", installmentPeriodLabel: "Ekim 2026" }),
    ];
    expect(supersededUncollectedMonthlyPlanIds(ambiguous, new Set()).size).toBe(0);
  });

  it("liste grubundan yalnız ikinci borç kalanını düşer", () => {
    const groups = [
      { studentId: "s", status: "overdue", contractId: undefined, amount: 8950, paidAmount: 0 },
      { studentId: "s", status: "pending", contractId: "live", amount: 7950, paidAmount: 0 },
    ];
    const evidence = [
      row({ id: "dup", dueDate: "2026-09-01T12:00:00.000Z", status: "pending" }),
      row({ id: "manual", source: "manual", description: "Elle", dueDate: "2026-09-01T12:00:00.000Z", amount: 1000 }),
      contractRow(),
    ];
    const next = subtractSupersededRemainders(groups, evidence, new Set());
    expect(next.find((g) => !g.contractId)?.amount).toBe(1000);
    expect(next.find((g) => g.contractId === "live")?.amount).toBe(7950);
  });
});
