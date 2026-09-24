/** UAT 2026-09-24 (C) — öğrenci başına ortalama aylık ücret. */
import { describe, it, expect } from "vitest";
import { computeAverageMonthlyFeePerStudent } from "../finance-summary";

const students = [
  { id: "s1", branchId: "b1" },
  { id: "s2", branchId: "b1" },
  { id: "s3", branchId: "b2" },
  { id: "s4", branchId: "b2", deletedAt: "2026-09-01" },
];
const c = (studentId: string, monthlyAmount: number, over: Partial<{ status: string; enrollmentStartDate: string; enrollmentEndDate: string }> = {}) => ({
  studentId,
  monthlyAmount,
  status: "signed",
  enrollmentStartDate: "2026-09-10",
  enrollmentEndDate: "2027-06-30",
  ...over,
});

describe("computeAverageMonthlyFeePerStudent", () => {
  it("farklı süreli sözleşmeleri aylık ücretle karşılaştırır (toplam bedel değil)", () => {
    const r = computeAverageMonthlyFeePerStudent({
      contracts: [c("s1", 6000, { enrollmentEndDate: "2026-11-30" }), c("s2", 8000), c("s3", 7000)],
      students,
      month: "2026-10",
    });
    expect(r).toEqual({ average: 7000, studentCount: 3, totalMonthly: 21000 });
  });

  it("şube filtresi yalnız o şubenin öğrencilerini sayar", () => {
    const r = computeAverageMonthlyFeePerStudent({ contracts: [c("s1", 6000), c("s2", 8000), c("s3", 7000)], students, month: "2026-10", branchId: "b2" });
    expect(r).toEqual({ average: 7000, studentCount: 1, totalMonthly: 7000 });
  });

  it("taslak/iptal/yenilenmiş, ayı kapsamayan ve silinmiş öğrenci sözleşmeleri hariç", () => {
    const r = computeAverageMonthlyFeePerStudent({
      contracts: [
        c("s1", 6000, { status: "draft" }),
        c("s2", 8000, { status: "cancelled" }),
        c("s3", 7000, { enrollmentStartDate: "2026-11-01" }),
        c("s4", 9000),
      ],
      students,
      month: "2026-10",
    });
    expect(r.average).toBeNull();
    expect(r.studentCount).toBe(0);
  });

  it("aynı öğrenci iki kez sayılmaz", () => {
    const r = computeAverageMonthlyFeePerStudent({ contracts: [c("s1", 6000), c("s1", 6000)], students, month: "2026-10" });
    expect(r.studentCount).toBe(1);
    expect(r.average).toBe(6000);
  });
});
