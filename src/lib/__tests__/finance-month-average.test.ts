/**
 * 10. tur iş #6 — ay seçimli finans özeti: ücret + tahsilat ortalaması,
 * bağımsız aylık trend, grafikler (SVG) ve Günlük Özet göstergesi.
 *
 * Ürün kararları (ekranda da yazılı):
 * - "Ortalama ücret" = ayı kapsayan geçerli sözleşmelerin aylık ücreti /
 *   sözleşmeli tekil öğrenci (tahakkuk; indirimli tutar esas).
 * - "Ortalama tahsilat" = AYNI öğrencilerin o ay vadesi gelen ödemelerinden
 *   fiilen tahsil edilen / aynı öğrenci sayısı (nakit; kısmi dahil).
 * - Pasif öğrenci, sözleşmesi geçerli ve ayı kapsıyorsa DAHİL — geçmiş
 *   aylar bugünkü aktiflikle yeniden yorumlanmaz.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  computeAverageCollectedPerStudent,
  computeAverageFeeTrend,
  computeAverageMonthlyFeePerStudent,
  computeFinanceSummary,
} from "../finance-summary";

const root = (...p: string[]) => join(process.cwd(), ...p);
const read = (rel: string) => readFileSync(root(rel), "utf-8");

const students = [
  { id: "s1", branchId: "b1" },
  { id: "s2", branchId: "b1" },
  { id: "s3", branchId: "b2" },
];
const c = (studentId: string, monthlyAmount: number, over: Partial<{ status: string; enrollmentStartDate: string; enrollmentEndDate: string }> = {}) => ({
  studentId,
  monthlyAmount,
  status: "signed",
  enrollmentStartDate: "2026-09-01",
  enrollmentEndDate: "2027-06-30",
  ...over,
});
const p = (studentId: string, dueDate: string, over: Partial<{ status: string; amount: number; paidAmount: number }> = {}) => ({
  studentId,
  dueDate,
  status: "paid",
  amount: 5000,
  paidAmount: 5000,
  ...over,
});

describe("ortalama tahsilat (ücretle aynı payda)", () => {
  it("kısmi dahil, voided hariç, ay-dışı ve payda-dışı hariç", () => {
    const r = computeAverageCollectedPerStudent({
      payments: [
        p("s1", "2026-10-05"), // 5000
        p("s2", "2026-10-06", { status: "partial", paidAmount: 2000 }), // 2000
        p("s3", "2026-10-07", { status: "voided", paidAmount: 5000 }), // 0
        p("s1", "2026-11-05"), // ay dışı
        p("s9", "2026-10-05"), // payda dışı
      ],
      studentIds: ["s1", "s2", "s3"],
      month: "2026-10",
    });
    expect(r).toEqual({ average: Math.round(7000 / 3), collectedTotal: 7000, studentCount: 3 });
  });

  it("payda boşsa null (sıfıra bölme yok)", () => {
    const r = computeAverageCollectedPerStudent({ payments: [p("s1", "2026-10-05")], studentIds: [], month: "2026-10" });
    expect(r.average).toBeNull();
    expect(r.collectedTotal).toBe(0);
  });
});

describe("aylık trend bağımsızlığı", () => {
  it("her ay kendi kapsayan sözleşmeleriyle hesaplanır", () => {
    const contracts = [
      c("s1", 6000, { enrollmentStartDate: "2026-09-01", enrollmentEndDate: "2026-09-30" }),
      c("s2", 9000, { enrollmentStartDate: "2026-10-01", enrollmentEndDate: "2026-12-31" }),
    ];
    const trend = computeAverageFeeTrend({
      contracts,
      students,
      payments: [p("s1", "2026-09-05", { amount: 6000, paidAmount: 6000 }), p("s2", "2026-10-05", { amount: 9000, paidAmount: 9000 })],
      months: ["2026-09", "2026-10"],
    });
    expect(trend[0]).toEqual({ month: "2026-09", average: 6000, collectedAverage: 6000, studentCount: 1 });
    expect(trend[1]).toEqual({ month: "2026-10", average: 9000, collectedAverage: 9000, studentCount: 1 });
  });

  it("pasif öğrenci geçerli sözleşmeyle DAHİL (tarih aralığı esas, bugünkü aktiflik değil)", () => {
    // computeAverageMonthlyFeePerStudent öğrencinin `active` alanını OKUMAZ —
    // sözleşme durumu + tarih aralığı belirleyicidir.
    const r = computeAverageMonthlyFeePerStudent({ contracts: [c("s1", 6000)], students, month: "2026-10" });
    expect(r.studentCount).toBe(1);
    expect(r.studentIds).toEqual(["s1"]);
  });
});

describe("ay seçimli özet", () => {
  const seedNow = new Date("2026-10-15T12:00:00.000Z");
  const baseData = {
    settings: { branches: [{ id: "b1", shortName: "B1" }] },
    payments: [p("s1", "2026-09-05", { status: "paid", amount: 6000, paidAmount: 6000 })],
    teacherPayouts: [],
    students: [],
  };

  it("geçmiş ay seçimi özeti + trend bitişini o aya taşır", () => {
    const s = computeFinanceSummary(baseData as never, [], [], [], seedNow, [], "2026-09");
    expect(s.month).toBe("2026-09");
    expect(s.trend).toHaveLength(6);
    expect(s.trend[5]!.month).toBe("2026-09");
    expect(s.studentPaymentsCollectedThisMonth).toBe(6000);
    const current = computeFinanceSummary(baseData as never, [], [], [], seedNow, []);
    expect(current.month).toBe("2026-10");
    expect(current.trend[5]!.month).toBe("2026-10");
    expect(current.studentPaymentsCollectedThisMonth).toBe(0);
  });

  it("geçersiz ay sessizce bugüne düşer", () => {
    const s = computeFinanceSummary(baseData as never, [], [], [], seedNow, [], "ekim");
    expect(s.month).toBe("2026-10");
    const s2 = computeFinanceSummary(baseData as never, [], [], [], seedNow, [], "2026-13");
    expect(s2.month).toBe("2026-10");
  });
});

describe("sayfa + grafik + widget (statik)", () => {
  it("ay seçici + tanım bloğu + iki ortalama + grafikler + tablolar", () => {
    const page = read("src/app/panel/finans-ozeti/page.tsx");
    expect(page).toMatch(/<Input type="month" name="ay"/);
    expect(page).toContain("Bu iki ortalama nasıl hesaplanır?");
    expect(page).toContain("Öğrenci başına ortalama aylık ücret");
    expect(page).toContain("Öğrenci başına ortalama tahsilat");
    expect(page).toContain("Aktif/pasif kapsamı");
    expect(page).toContain("<IncomeExpenseChart");
    expect(page).toContain("<AverageFeeChart");
    expect(page).toContain("Ortalama tahsilat</th>");
  });

  it("grafikler erişilebilir: role=img + aria-label + title ipuçları", () => {
    const charts = read("src/components/finance-trend-charts.tsx");
    expect(charts).toContain('role="img"');
    expect(charts).toContain("aria-label");
    expect(charts).toContain("<title>");
  });

  it("Günlük Özet'te tek finans göstergesi (bu ay tahsilat)", () => {
    const widgets = read("src/lib/dashboard/screen-widgets.ts");
    expect(widgets).toContain('"/panel/finans-ozeti"');
    expect(widgets).toContain("bu ay tahsilat");
  });
});
