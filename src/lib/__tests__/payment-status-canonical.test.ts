import { describe, expect, it } from "vitest";
import { resolvePaymentDisplayStatus, canonicalPaymentStatus } from "../payments/status";
import { buildPaymentMonthView } from "../payment-month-view";
import { summarizeStudentDebt } from "../payment-profile";
import type { PaymentListRow } from "../reference-data";

const TODAY = "2026-10-20";
const base = { status: "pending" as "pending" | "paid", amount: 3000, paidAmount: 0, contractId: undefined as string | undefined };

describe("2026-10-20 — ödeme durumu tek çözücü (dış liste = öğrenci detayı)", () => {
  it("vadesi geçmiş ama DB'de 'pending' kalmış satır Gecikmiş; detay özeti de aynı borcu gecikmiş sayar", () => {
    const row = { ...base, dueDate: "2026-10-05" };
    expect(resolvePaymentDisplayStatus(row, new Set(), TODAY)).toBe("overdue");
    expect(canonicalPaymentStatus(row, TODAY)).toBe("overdue");
    expect(summarizeStudentDebt([row], new Set()).overdueTotal).toBe(3000);
  });

  it("iptal/yenilenmiş sözleşmenin ödenmemiş taksiti 'Sözleşme kapandı' — borç değil, ay beklentisine girmez", () => {
    const row = { ...base, contractId: "c-old", dueDate: "2026-10-05" };
    const terminal = new Set(["c-old"]);
    expect(resolvePaymentDisplayStatus(row, terminal, TODAY)).toBe("closed");
    const view = buildPaymentMonthView([{ ...row, id: "p1", studentId: "s1", description: "Ekim", createdAt: TODAY } as PaymentListRow], {
      month: "2026-10",
      todayYmd: TODAY,
      terminalContractIds: terminal,
      studentName: () => "Pırıl",
    });
    expect(view.rows).toHaveLength(0);
    expect(view.excludedCount).toBe(1);
    expect(view.summary.expected).toBe(0);
  });

  it("kısmi (vadesi gelmemiş) → Kısmi; vadesi geçince Gecikmiş; 7 gün içi → Yaklaşan; uzak → Bekliyor", () => {
    expect(resolvePaymentDisplayStatus({ ...base, paidAmount: 1000, dueDate: "2026-10-25" }, new Set(), TODAY)).toBe("partial");
    expect(resolvePaymentDisplayStatus({ ...base, paidAmount: 1000, dueDate: "2026-10-19" }, new Set(), TODAY)).toBe("overdue");
    expect(resolvePaymentDisplayStatus({ ...base, dueDate: "2026-10-27" }, new Set(), TODAY)).toBe("upcoming");
    expect(resolvePaymentDisplayStatus({ ...base, dueDate: "2026-11-15" }, new Set(), TODAY)).toBe("pending");
  });

  it("gün sınırı kurum saatinde: 20 Ekim 23:30 TR (20:30Z) vadesi 20 Ekim'de geçmiş sayılmaz", () => {
    expect(resolvePaymentDisplayStatus({ ...base, dueDate: "2026-10-20T20:30:00.000Z" }, new Set(), TODAY)).toBe("upcoming");
    // 19 Ekim 22:00Z = 20 Ekim 01:00 TR → vade günü 20 Ekim, henüz geçmedi.
    expect(resolvePaymentDisplayStatus({ ...base, dueDate: "2026-10-19T22:00:00.000Z" }, new Set(), TODAY)).toBe("upcoming");
  });

  it("ay özeti: beklenen/tahsil/kalan/oran aynı satırlardan; önceki ayın gecikmişi ayrı devreder", () => {
    const rows = [
      { ...base, id: "a", studentId: "s1", description: "Ekim", dueDate: "2026-10-05", status: "paid", paidAmount: 3000 },
      { ...base, id: "b", studentId: "s2", description: "Ekim", dueDate: "2026-10-10", paidAmount: 1000 },
      { ...base, id: "c", studentId: "s3", description: "Eylül", dueDate: "2026-09-05" },
    ].map((r) => ({ ...r, createdAt: TODAY }) as PaymentListRow);
    const view = buildPaymentMonthView(rows, { month: "2026-10", todayYmd: TODAY, terminalContractIds: new Set(), studentName: (id) => id });
    expect(view.summary).toMatchObject({ expected: 6000, collected: 4000, remaining: 2000, overdue: 2000, collectionRate: 67 });
    expect(view.carryover.map((r) => r.id)).toEqual(["c"]);
    expect(view.carryoverTotal).toBe(3000);
  });
});
