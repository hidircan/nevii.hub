import { describe, it, expect } from "vitest";
import { resolveContractPlanForMonth } from "../attendance-calendar-plan";

// 2026-10-20 — ay kutusu yalnız o aya ait gerçek yükümlülüğü gösterir; karttaki aylık ücret ilgisiz aylara yayılmaz.
const contract = (start: string, end: string) => ({ id: "c1", contractNumber: "S-1", status: "signed" as const, enrollmentStartDate: start, enrollmentEndDate: end });
const row = (id: string, seq: number, label: string, due: string) => ({
  id, contractId: "c1", installmentSequence: seq, amount: 6950, paidAmount: 0, status: "pending" as const, dueDate: due, installmentPeriodLabel: label,
});
const plan = (month: number, input: Partial<Parameters<typeof resolveContractPlanForMonth>[0]>) =>
  resolveContractPlanForMonth({ contracts: [], installments: [], year: 2026, month, studentMonthlyFee: 6950, ...input });
const shownAmount = (p: ReturnType<typeof resolveContractPlanForMonth>) => (p.state === "ok" || p.state === "student_plan" ? p.amount : 0);

describe("ay kutusu tutarı — yalnız o aya ait yükümlülük", () => {
  it("yalnız Ekim+Kasım taksiti varsa Eylül boş, Ekim/Kasım kendi tutarıyla", () => {
    const input = { contracts: [contract("2026-10-01", "2026-11-30")], installments: [row("p1", 1, "Ekim 2026", "2026-10-05"), row("p2", 2, "Kasım 2026", "2026-11-05")] };
    const sep = plan(9, input);
    expect(sep.state).toBe("no_active_contract");
    expect(shownAmount(sep)).toBe(0);
    expect(shownAmount(plan(10, input))).toBe(6950);
    expect(shownAmount(plan(11, input))).toBe(6950);
  });

  it("sözleşme Kasım'da başlıyorsa (Arcan/Faruk deseni) Eylül/Ekim'de ücret görünmez", () => {
    const input = { contracts: [contract("2026-11-01", "2027-06-30")], installments: [row("p1", 1, "Kasım 2026", "2026-11-05")] };
    for (const m of [9, 10]) expect(plan(m, input).state).toBe("no_active_contract");
    expect(shownAmount(plan(11, input))).toBe(6950);
  });

  it("sözleşme bittikten sonraki ay boş", () => {
    const input = { contracts: [contract("2026-09-01", "2026-10-31")], installments: [row("p1", 1, "Eylül 2026", "2026-09-05")] };
    expect(plan(12, input).state).toBe("no_active_contract");
  });

  it("peşin/birleşik tahsilat yalnız kırılımdaki aylara dağılır", () => {
    const input = {
      contracts: [contract("2026-10-01", "2026-12-31")],
      installments: [{
        ...row("p1", 1, "Ekim 2026", "2026-10-01"), amount: 13900, paidAmount: 13900, status: "paid" as const, paidAt: "2026-10-01T09:00:00.000Z",
        installmentBreakdown: [{ periodLabel: "Ekim 2026", amount: 6950 }, { periodLabel: "Kasım 2026", amount: 6950 }],
      }],
    };
    expect(shownAmount(plan(10, input))).toBe(6950);
    expect(shownAmount(plan(11, input))).toBe(6950);
    expect(plan(12, input).state).toBe("no_installment_for_month");
    expect(plan(9, input).state).toBe("no_active_contract");
  });

  it("sözleşmesiz öğrencide satır yoksa tahsilat akışı açık ama tutar 0", () => {
    const p = plan(9, {});
    expect(p.state).toBe("student_plan");
    expect(shownAmount(p)).toBe(0);
  });
});
