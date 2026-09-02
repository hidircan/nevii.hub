import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool, createTeacherTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const CATALOG_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "instrument-catalog.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

function baseStudentInput(overrides?: Record<string, unknown>) {
  return {
    name: "Test Öğrenci",
    email: "",
    phone: "0555 000 0000",
    parentName: "Veli",
    parentPhone: "0555 000 0001",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    enrollmentStartDate: "2026-09-01",
    lessonDurationMinutes: 30,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(CATALOG_FILE, { force: true });
});

/**
 * MT-003 — öğrenci oluşturmada enstrümana göre öğretmen seçimi sunucu
 * tarafında da doğrulanır (filtre yalnız UI'da kalmaz). Seed'de t1
 * (Turgay Hoşbaş) Piyano/Gitar/Elektro Gitar/Şan/Yan Flüt öğretir, Keman
 * öğretmez — bkz. src/lib/seed.ts.
 */
describe("createStudentTool — MT-003 enstrüman/öğretmen uyumu", () => {
  it("öğretmen seçilen enstrümanı öğretiyorsa öğrenci oluşturulur", async () => {
    const res = await createStudentTool(ctx(), baseStudentInput({ instrument: "Piyano", teacherId: "t1" }));
    expect(res.ok).toBe(true);
  });

  it("çoklu enstrümanlı öğretmenin İKİNCİ enstrümanı da yeterlidir", async () => {
    const res = await createStudentTool(ctx(), baseStudentInput({ instrument: "Şan", teacherId: "t1" }));
    expect(res.ok).toBe(true);
  });

  it("öğretmen seçilen enstrümanı öğretmiyorsa reddedilir", async () => {
    const res = await createStudentTool(ctx(), baseStudentInput({ instrument: "Keman", teacherId: "t1" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("pasif öğretmen seçilirse reddedilir", async () => {
    const created = await createTeacherTool(ctx(), {
      name: "Pasif Öğretmen",
      phone: "0555 999 9999",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { archiveTeacherTool } = await import("../services/tools");
    await archiveTeacherTool(ctx(), { teacherId: created.data.teacherId, archived: true });

    const res = await createStudentTool(
      ctx(),
      baseStudentInput({ instrument: "Piyano", teacherId: created.data.teacherId })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("var olmayan/başka tenant öğretmen ID'si reddedilir (IDOR'a kapalı)", async () => {
    const res = await createStudentTool(ctx(), baseStudentInput({ teacherId: "does-not-exist" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});
