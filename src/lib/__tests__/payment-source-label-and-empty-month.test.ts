import { describe, it, expect } from "vitest";
import { DEBT_SOURCE_LABEL, debtSourceOf, paymentSourceLabel } from "../payment-source-label";
import { debtSourceOf as profileDebtSourceOf } from "../payment-profile";
import { isEmptyMonthPlan, resolveContractPlanForMonth } from "../attendance-calendar-plan";

// 2026-10-23 — tek kaynak adı (tüm ekranlar) ve takvimde boş ay.
describe("ödeme kaynağı adı — tek kural", () => {
  it("sözleşmeli = Sözleşme taksidi, sözleşmesiz = Sözleşmesiz aylık plan; ödenmemiş satırda 'tahsilat' yazmaz", () => {
    expect(paymentSourceLabel({ source: "contract", contractId: "c1" })).toBe("Sözleşme taksidi");
    expect(paymentSourceLabel({ source: "contract" })).toBe("Sözleşme taksidi");
    expect(paymentSourceLabel({ source: "registration_first_payment", contractId: "c1" })).toBe("Sözleşme taksidi");
    expect(paymentSourceLabel({ source: "monthly_plan" })).toBe("Sözleşmesiz aylık plan");
    expect(paymentSourceLabel({ source: "lesson_ops", lessonId: "l1" })).toBe("Ders bazlı ücret");
    expect(paymentSourceLabel({ source: "manual" })).toBe("Elle girilen kayıt");
    for (const label of [DEBT_SOURCE_LABEL.monthly_plan, DEBT_SOURCE_LABEL.contract, DEBT_SOURCE_LABEL.lesson, DEBT_SOURCE_LABEL.manual]) {
      expect(label.toLocaleLowerCase("tr")).not.toMatch(/tahsilat|borç/);
    }
    expect(profileDebtSourceOf).toBe(debtSourceOf);
  });
});

describe("takvimde boş ay", () => {
  const base = { contracts: [], year: 2027, month: 2, studentMonthlyFee: 7950 };
  it("o aya ait satır yoksa ay boştur (ücret tek başına yükümlülük değildir); satır varsa boş değildir", () => {
    expect(isEmptyMonthPlan(resolveContractPlanForMonth({ ...base, installments: [] }))).toBe(true);
    expect(isEmptyMonthPlan(resolveContractPlanForMonth({ ...base, studentMonthlyFee: 0, installments: [] }))).toBe(true);
    const row = {
      id: "p", amount: 7950, paidAmount: 0, status: "pending", source: "monthly_plan",
      dueDate: "2027-02-01T12:00:00.000Z", description: "Aylık plan — 2027-02 (7950 TL)", installmentPeriodLabel: "Şubat 2027",
    };
    expect(isEmptyMonthPlan(resolveContractPlanForMonth({ ...base, installments: [row] }))).toBe(false);
  });

  it("dikkat gerektiren sözleşme durumları boş sayılmaz", () => {
    const contract = { id: "c", contractNumber: "NP-1", status: "generated" as const, enrollmentStartDate: "2027-01-01", enrollmentEndDate: "2027-06-30" };
    const noInstallment = resolveContractPlanForMonth({ ...base, contracts: [contract], installments: [] });
    expect(noInstallment.state).toBe("no_installment_for_month");
    expect(isEmptyMonthPlan(noInstallment)).toBe(false);
    const multiple = resolveContractPlanForMonth({ ...base, contracts: [contract, { ...contract, id: "c2", contractNumber: "NP-2" }], installments: [] });
    expect(isEmptyMonthPlan(multiple)).toBe(false);
  });
});
