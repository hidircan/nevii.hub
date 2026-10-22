import { describe, it, expect } from "vitest";
import { planStandaloneMonthlyAccruals } from "../standalone-monthly-accrual";
import { summarizeStudentDebt } from "../payment-profile";
import type { Payment, Student } from "../types";

const student = (id: string, p: Partial<Student> = {}): Student =>
  ({ id, name: id, active: true, monthlyFee: 5950, enrollmentStartDate: "2026-09-03", ...p }) as Student;
const pay = (p: Partial<Payment> & Pick<Payment, "id" | "studentId">): Payment => ({
  amount: 4470,
  paidAmount: 4470,
  status: "paid",
  dueDate: "2026-09-03T00:00:00.000Z",
  description: "İlk Ödeme",
  source: "registration_first_payment",
  ...p,
});

describe("sözleşmesiz aylık tahakkuk (2026-10-05 — Öğrenciler listesinde açık borç görünmüyordu)", () => {
  it("ilk tahsilattan sonraki ay borç yazılır ve listedeki tek borç kuralında açık görünür", () => {
    const payments = [pay({ id: "r1", studentId: "a" })];
    const plan = planStandaloneMonthlyAccruals({
      students: [student("a")],
      payments,
      contractStatusByStudent: new Map(),
      month: "2026-10",
    });
    expect(plan).toEqual([{ studentId: "a", month: "2026-10", amount: 5950 }]);
    // Satır yazıldıktan sonra liste kuralı açık borcu görür; tekrar çalıştırmak ikinci satır üretmez.
    const accrued = pay({ id: "m1", studentId: "a", amount: 5950, paidAmount: 0, status: "pending", source: "monthly_plan", dueDate: "2026-10-01T12:00:00.000Z" });
    expect(summarizeStudentDebt([...payments, accrued], new Set()).openTotal).toBe(5950);
    expect(
      planStandaloneMonthlyAccruals({ students: [student("a")], payments: [...payments, accrued], contractStatusByStudent: new Map(), month: "2026-10" })
    ).toEqual([]);
  });

  it("karşılanmış ay, sözleşmeli, pasif/silinmiş/durdurulmuş, ücretsiz, kayıt ayı ve bitmiş kayıt atlanır", () => {
    const students = [
      student("nextMonthPaid"),
      student("contract"),
      student("cancelledContract"),
      student("inactive", { active: false }),
      student("deleted", { deletedAt: "2026-10-01" }),
      student("paused", { paymentPauseStatus: "paused" }),
      student("free", { monthlyFee: 0 }),
      student("startsThisMonth", { enrollmentStartDate: "2026-10-02" }),
      student("ended", { enrollmentEndDate: "2026-09-30" }),
      student("voidedPlan"),
      student("paidViaCalendar"),
    ];
    const payments = [
      pay({ id: "n", studentId: "nextMonthPaid", amount: 8925, paidAmount: 8925, firstCollectionIncludesNextMonth: true }),
      // İptal edilmiş Ekim planı yeniden borçlandırılmaz (upsert onu güncellerdi).
      pay({ id: "v", studentId: "voidedPlan", amount: 5950, status: "voided", source: "monthly_plan", description: "Aylık plan — 2026-10 (5950 TL)", dueDate: "2026-10-01T12:00:00.000Z" }),
      // Canlı vaka: Ekim takvimden ödendi, vade tahsilat günü (30.09) — ay açıklamada; ikinci Ekim borcu YOK.
      pay({ id: "c", studentId: "paidViaCalendar", amount: 6950, paidAmount: 6950, source: "monthly_plan", description: "Aylık plan — 2026-10 (6950 TL)", dueDate: "2026-09-30T12:00:00.000Z" }),
    ];
    const plan = planStandaloneMonthlyAccruals({
      students,
      payments,
      contractStatusByStudent: new Map([
        ["contract", "generated"],
        ["cancelledContract", "cancelled"],
      ]),
      month: "2026-10",
    });
    expect(plan.map((p) => p.studentId)).toEqual(["cancelledContract"]);
  });

  it("sözleşme özeti yokken taksit aynı ayı kapsıyorsa aylık plan yazılmaz; iptal taksidi engellemez", () => {
    const plan = planStandaloneMonthlyAccruals({
      students: [student("hiddenContract"), student("cancelledWithInstallment")],
      payments: [
        pay({
          id: "hc",
          studentId: "hiddenContract",
          amount: 5950,
          paidAmount: 0,
          status: "pending",
          source: "contract",
          contractId: "live",
          dueDate: "2026-10-05T12:00:00.000Z",
          installmentPeriodLabel: "Ekim 2026",
        }),
        pay({
          id: "cc",
          studentId: "cancelledWithInstallment",
          amount: 5950,
          paidAmount: 0,
          status: "pending",
          source: "contract",
          contractId: "dead",
          dueDate: "2026-10-05T12:00:00.000Z",
          installmentPeriodLabel: "Ekim 2026",
        }),
      ],
      contractStatusByStudent: new Map(),
      terminalContractIds: new Set(["dead"]),
      month: "2026-10",
    });
    expect(plan.map((p) => p.studentId)).toEqual(["cancelledWithInstallment"]);
  });
});
