/**
 * 2026-09-17 — kayıt/sözleşme ücret regresyonları:
 *  A) aylık ücret alanı sıfır/boş değeri doğal yazılır
 *  F) ücret hesabı KAYIT tarihinden değil DERS başlangıcından
 *  G) bir ayda en fazla haftalık×4 ders ücretlendirilir (5 Salı'lı ay = tam aylık ücret)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { previewContractInstallmentPlanTool, previewPeriodBillingSimulationTool } from "../services/tools";
import { computePeriodAmount, countExactWeekdayLessons } from "../period-lesson-billing";
import { buildContractPrefill, prefillFromContract } from "../contract-prefill";
import { parseAmountInput, sanitizeAmountInput } from "../amount-input";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const MONTHLY = 4950;

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("A — aylık ücret yazımı", () => {
  it("boş değer boş kalır (0'a dönmez); baştaki sıfırlar ve rakam dışı karakterler atılır", () => {
    expect(sanitizeAmountInput("")).toBe("");
    expect(sanitizeAmountInput("0")).toBe("0");
    expect(sanitizeAmountInput("04950")).toBe("4950");
    expect(sanitizeAmountInput("4.950 TL")).toBe("4950");
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("3000")).toBe(3000);
  });
});

describe("G — ayda en fazla haftalık×4 ders ücretlendirilir", () => {
  it("haftada 1 ders, 5 Salı'lı Eylül 2026: takvim 5 der, ücret 4 ders = tam aylık ücret", () => {
    const lessons = countExactWeekdayLessons("2026-09-01", "2026-09-30", [2], { term: "guz", overrides: [] });
    expect(lessons).toBe(5);
    expect(computePeriodAmount(MONTHLY, 1, lessons)).toBe(MONTHLY);
  });

  it("kısmi ay orantısı değişmez: 3 ders = 3.712 (küsurat aşağı)", () => {
    expect(computePeriodAmount(MONTHLY, 1, 3)).toBe(3712);
  });

  it("haftada 2 ders: tavan 8 ders", () => {
    expect(computePeriodAmount(4000, 2, 10)).toBe(4000);
    expect(computePeriodAmount(4000, 2, 9)).toBe(4000);
    expect(computePeriodAmount(4000, 2, 6)).toBe(3000);
    // Salı+Perşembe, Eylül 2026: takvim 9 ders (5 Salı + 4 Perşembe) → ücret 8 ders = tam aylık
    const lessons = countExactWeekdayLessons("2026-09-01", "2026-09-30", [2, 4], { term: "guz", overrides: [] });
    expect(lessons).toBe(9);
    expect(computePeriodAmount(4000, 2, lessons)).toBe(4000);
  });
});

async function seedStudent(opts: { enrollmentStartDate: string; lessonStartDate: string; tuesdays: string[] }) {
  const { readData, writeData } = await import("../store-json");
  const data = await readData();
  data.students.push({
    id: "s_start",
    name: "Ders Başlangıcı Öğrencisi",
    email: "",
    phone: "5551234567",
    parentName: "Veli",
    parentPhone: "5559876543",
    branchId: "erzene",
    instruments: ["Piyano"],
    teacherId: "t1",
    weeklyLessonCount: 1,
    monthlyFee: MONTHLY,
    derivedPerLessonAmount: Math.round(MONTHLY / 4),
    enrollmentStartDate: opts.enrollmentStartDate,
    lessonStartDate: opts.lessonStartDate,
    enrollmentEndDate: "2027-06-30",
    active: true,
    notes: "",
    createdAt: `${opts.enrollmentStartDate}T09:00:00.000Z`,
    lessonDurationMinutes: 40,
  } as unknown as (typeof data.students)[number]);
  opts.tuesdays.forEach((day, i) =>
    data.lessons.push({
      id: `les_start_${i}`,
      studentId: "s_start",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt: `${day}T12:00:00.000Z`,
      endAt: `${day}T12:40:00.000Z`,
      type: "regular",
      status: "scheduled",
    } as unknown as (typeof data.lessons)[number])
  );
  await writeData(data);
}

describe("F + G — sözleşme önizlemesi ders başlangıcından ve 4 ders tavanıyla", () => {
  it("kayıt 20 Kasım, ders başlangıcı 1 Aralık: ilk satır Aralık; 5 Salı'lı Aralık tam aylık ücret", async () => {
    await seedStudent({
      enrollmentStartDate: "2026-11-20",
      lessonStartDate: "2026-12-01",
      tuesdays: ["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22", "2026-12-29", "2027-01-05", "2027-01-12"],
    });
    const { readData } = await import("../store-json");
    const student = (await readData()).students.find((s) => s.id === "s_start")!;
    const prefill = buildContractPrefill({ student });
    expect(prefill.enrollmentStartDate).toBe("2026-12-01");

    const res = await previewContractInstallmentPlanTool(admin, {
      studentId: "s_start",
      durationMonths: 3,
      monthlyAmount: MONTHLY,
      installmentCount: 3,
      firstDueDate: "2026-12-01",
      enrollmentStartDate: prefill.enrollmentStartDate,
      enrollmentEndDate: "2027-02-28",
      usePerLessonBilling: true,
      mergeFirstCollection: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.installments[0]!.periodLabel).toContain("Aralık 2026");
    expect(res.data.installments[0]!.amount).toBe(MONTHLY);
    expect(res.data.installments.some((i) => (i.periodLabel ?? "").includes("Kasım"))).toBe(false);
  });

  it("iptal edilmiş eski sözleşmeden yeniden oluştururken başlangıç kaydın ders başlangıcıdır", () => {
    const base = buildContractPrefill({
      student: { monthlyFee: MONTHLY, enrollmentStartDate: "2026-11-20", lessonStartDate: "2026-12-01" },
    });
    const rebuilt = prefillFromContract({ enrollmentStartDate: "2026-11-20", monthlyAmount: MONTHLY, installmentCount: 10 }, base);
    expect(rebuilt.enrollmentStartDate).toBe("2026-12-01");
  });

  it("ödeme simülasyonu tarih verilmezse ders başlangıcından başlar", async () => {
    await seedStudent({ enrollmentStartDate: "2026-11-20", lessonStartDate: "2026-12-01", tuesdays: [] });
    const res = await previewPeriodBillingSimulationTool(admin, { studentId: "s_start" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.lines[0]!.periodStart).toBe("2026-12-01");
  });
});
