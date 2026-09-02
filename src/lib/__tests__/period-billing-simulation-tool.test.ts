import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool, previewPeriodBillingSimulationTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * P0-1 (2026-09-02 düzeltme) — simülasyon artık `perLessonNetFee`'yi
 * client'tan ASLA kabul etmez; yalnız `monthlyFee` girilebilir, ders başı
 * karşılığı sunucuda `derivePerLessonAmount` ile türetilir — kayıt akışıyla
 * (createStudentTool) BİREBİR aynı motor/formül.
 */
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

describe("previewPeriodBillingSimulationTool — kayıt-öncesi ham simülasyon (yalnız monthlyFee, perLessonNetFee YOK)", () => {
  it("1) aylık 4.000 TL + haftada 2 ders: ilk kısa dönem 2.000, tam dönem 4.000, toplam 6.000", async () => {
    const res = await previewPeriodBillingSimulationTool(ctx(), {
      enrollmentStartDate: "2026-09-15",
      enrollmentEndDate: "2026-10-31",
      weeklyLessonCount: 2,
      monthlyFee: 4000,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines).toHaveLength(2);
    expect(res.data.lines[0]!.perLessonNetFee).toBe(500);
    expect(res.data.lines.every((l) => l.estimated)).toBe(true);
    expect(res.data.grandTotal).toBe(res.data.lines[0]!.autoCalculatedAmount + res.data.lines[1]!.autoCalculatedAmount);
    expect(res.data.lines[0]!.dueDate).toBe("2026-09-15");
    expect(res.data.lines[0]!.cumulativeTotal).toBe(res.data.lines[0]!.autoCalculatedAmount);
    expect(res.data.lines[1]!.cumulativeTotal).toBe(res.data.grandTotal);
  });

  it("6) client 'perLessonNetFee' gönderse bile zod tarafından silinir — monthlyFee'den yeniden türetilir", async () => {
    const res = await previewPeriodBillingSimulationTool(ctx(), {
      enrollmentStartDate: "2026-09-15",
      enrollmentEndDate: "2026-09-30",
      weeklyLessonCount: 2,
      monthlyFee: 4000,
      perLessonNetFee: 999999,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines[0]!.perLessonNetFee).toBe(500);
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
      monthlyFee: 4000,
      firstPeriodManualNetAmount: 100,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines[0]!.cumulativeTotal).toBe(100);
    expect(res.data.grandTotal).toBe(100);
  });
});

describe("previewPeriodBillingSimulationTool — var olan öğrenci", () => {
  async function createStudent(monthlyFee: number, weeklyLessonCount: number) {
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
      weeklyLessonCount,
      monthlyFee,
      enrollmentStartDate: "2026-09-01",
      firstPaymentCollected: { method: "cash", amount: monthlyFee, collectedAt: "2026-09-01" },
    });
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    return res.data.studentId;
  }

  it("13) studentId verilirse öğrencinin kendi (kayıt anında türetilmiş) ders başı karşılığı kullanılır — kayıtla AYNI motor", async () => {
    const studentId = await createStudent(2000, 1); // derived = round(2000/4) = 500
    const res = await previewPeriodBillingSimulationTool(ctx(), { studentId, enrollmentEndDate: "2026-09-30" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines[0]!.perLessonNetFee).toBe(500);
  });

  it("her yeni kayıt (eskiden 'legacy' sayılan monthlyFee-only girişler dahil) artık aynı türetmeyi otomatik alır", async () => {
    const studentId = await createStudent(3000, 1); // derived = round(3000/4) = 750
    const res = await previewPeriodBillingSimulationTool(ctx(), { studentId, enrollmentEndDate: "2026-09-30" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lines[0]!.perLessonNetFee).toBe(750);
  });
});
