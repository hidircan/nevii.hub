import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool, previewPeriodBillingSimulationTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("previewPeriodBillingSimulationTool — RBAC", () => {
  it("TEACHER göremez (FORBIDDEN)", async () => {
    const res = await previewPeriodBillingSimulationTool(ctx({ role: "TEACHER", teacherId: "t1" }), {});
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("previewPeriodBillingSimulationTool — kayıt-öncesi ham simülasyon", () => {
  it("örnek senaryo: ilk kısa dönem 4×500=2000, tam dönem 8×500=4000 tahmini toplamı 6000", async () => {
    const res = await previewPeriodBillingSimulationTool(ctx(), {
      enrollmentStartDate: "2026-09-15",
      enrollmentEndDate: "2026-10-31",
      weeklyLessonCount: 2,
      perLessonNetFee: 500,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines).toHaveLength(2);
    expect(res.data.lines.every((l) => l.estimated)).toBe(true);
    expect(res.data.grandTotal).toBe(res.data.lines[0]!.autoCalculatedAmount + res.data.lines[1]!.autoCalculatedAmount);
    expect(res.data.lines[0]!.dueDate).toBe("2026-09-15");
    expect(res.data.lines[0]!.cumulativeTotal).toBe(res.data.lines[0]!.autoCalculatedAmount);
    expect(res.data.lines[1]!.cumulativeTotal).toBe(res.data.grandTotal);
  });

  it("eksik alan VALIDATION_ERROR döner", async () => {
    const res = await previewPeriodBillingSimulationTool(ctx(), { enrollmentStartDate: "2026-09-15" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("manuel ilk dönem tutarı verilirse ilk satırda ve toplamda kullanılır", async () => {
    const res = await previewPeriodBillingSimulationTool(ctx(), {
      enrollmentStartDate: "2026-09-15",
      enrollmentEndDate: "2026-09-30",
      weeklyLessonCount: 2,
      perLessonNetFee: 500,
      firstPeriodManualNetAmount: 100,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines[0]!.cumulativeTotal).toBe(100);
    expect(res.data.grandTotal).toBe(100);
  });
});

describe("previewPeriodBillingSimulationTool — var olan per_lesson öğrenci", () => {
  async function createPerLessonStudent() {
    const res = await createStudentTool(ctx(), {
      name: "Simülasyon Öğrencisi",
      email: "",
      phone: "5551230002",
      parentName: "Veli",
      parentPhone: "5559870002",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 2000,
      pricingModel: "per_lesson",
      perLessonNetFee: 400,
      enrollmentStartDate: "2026-09-01",
      firstPaymentCollected: { method: "cash", amount: 400 * 4, collectedAt: "2026-09-01" },
    });
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    return res.data.studentId;
  }

  it("studentId verilirse öğrencinin kendi perLessonNetFee/weeklyLessonCount'u kullanılır", async () => {
    const studentId = await createPerLessonStudent();
    const res = await previewPeriodBillingSimulationTool(ctx(), { studentId, enrollmentEndDate: "2026-09-30" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines[0]!.perLessonNetFee).toBe(400);
  });

  it("17) legacy (monthly) öğrenci için simülasyon reddedilir", async () => {
    const res = await createStudentTool(ctx(), {
      name: "Legacy Öğrenci",
      email: "",
      phone: "5551230003",
      parentName: "Veli",
      parentPhone: "5559870003",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sim = await previewPeriodBillingSimulationTool(ctx(), { studentId: res.data.studentId });
    expect(sim.ok).toBe(false);
  });
});
