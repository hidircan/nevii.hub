import { describe, it, expect } from "vitest";
import { resolveContractPlanForMonth } from "../attendance-calendar-plan";

describe("yoklama takvimi ay kutusu — tahsilat tarihi/şekli sabit (2026-10-05)", () => {
  it("Eylül 5 Ekim'de nakit ödendiyse Eylül kutusu 05.10 + nakit taşır; ödenmemiş/iptal satır tahsilat değildir", () => {
    const plan = resolveContractPlanForMonth({
      contracts: [{ id: "c1", contractNumber: "S-1", status: "signed", enrollmentStartDate: "2026-09-01", enrollmentEndDate: "2027-06-30" }],
      installments: [
        { id: "p9", contractId: "c1", installmentSequence: 1, amount: 5950, paidAmount: 5950, status: "paid", dueDate: "2026-09-05", installmentPeriodLabel: "Eylül 2026", paidAt: "2026-10-05T09:00:00.000Z", method: "cash" },
        { id: "p10", contractId: "c1", installmentSequence: 2, amount: 5950, paidAmount: 0, status: "pending", dueDate: "2026-10-05", installmentPeriodLabel: "Ekim 2026" },
      ],
      year: 2026,
      month: 9,
    });
    expect(plan.state === "ok" && plan.collections).toEqual([{ paidAt: "2026-10-05T09:00:00.000Z", method: "cash", amount: 5950 }]);
    const oct = resolveContractPlanForMonth({
      contracts: [{ id: "c1", contractNumber: "S-1", status: "signed", enrollmentStartDate: "2026-09-01", enrollmentEndDate: "2027-06-30" }],
      installments: [{ id: "p10", contractId: "c1", installmentSequence: 2, amount: 5950, paidAmount: 0, status: "pending", dueDate: "2026-10-05", installmentPeriodLabel: "Ekim 2026" }],
      year: 2026,
      month: 10,
    });
    expect(oct.state === "ok" && oct.collections).toEqual([]);
  });
});
