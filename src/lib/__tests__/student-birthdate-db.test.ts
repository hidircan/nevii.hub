import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * Regresyon — db modunda `addStudent` birthDate'i ham "YYYY-MM-DD" string
 * olarak Prisma `create`'e geçiriyordu (Prisma DateTime reddeder → doğum
 * tarihi girilen HER öğrenci kaydı başarısız). Prisma istemcisi mock'lanır;
 * `create`/`updateMany` payload'u yakalanıp bilinçli olarak reddedilir ki
 * ardından gelen `readData()` (tam şema sorgusu) çalışmasın.
 */
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("../db", () => ({
  prisma: {
    branch: { findFirst: vi.fn().mockResolvedValue({ id: "erzene", schoolId: "sch1" }) },
    student: { create: mocks.create, updateMany: mocks.updateMany },
  },
}));
vi.mock("../entity-sequence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../entity-sequence")>()),
  allocateSequenceValueDb: vi.fn().mockResolvedValue(1),
}));
vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { runWithTenantAsync } from "../tenant-context";
import { addStudent, updateStudentProfile } from "../store-db";
import { toDateOnlyDbValue } from "../date-input";
import { formatDate } from "../utils";
import { updateStudentProfileSchema } from "../validation";
import { createStudentTool } from "../services/tools";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const STOP = new Error("STOP_AFTER_PAYLOAD");

const baseStudent = {
  name: "Doğum Tarihi Testi",
  email: "",
  phone: "5551234567",
  parentName: "Veli",
  parentPhone: "5559876543",
  branchId: "erzene",
  instruments: ["Piyano"],
  teacherId: "t1",
  packageName: "Bireysel",
  weeklyLessonCount: 1,
  monthlyFee: 3000,
  notes: "",
} as unknown as Parameters<typeof addStudent>[0];

beforeEach(() => {
  mocks.create.mockReset().mockRejectedValue(STOP);
  mocks.updateMany.mockReset().mockRejectedValue(STOP);
});

describe("db modu — öğrenci doğum tarihi Prisma'ya Date olarak yazılır", () => {
  it("addStudent: YYYY-MM-DD → create payload'unda UTC öğlen Date", async () => {
    await expect(runWithTenantAsync("t1", () => addStudent({ ...baseStudent, birthDate: "2000-01-01" }))).rejects.toBe(STOP);
    const data = mocks.create.mock.calls[0]![0].data;
    expect(data.birthDate).toBeInstanceOf(Date);
    expect((data.birthDate as Date).toISOString()).toBe("2000-01-01T12:00:00.000Z");
  });

  it("addStudent: birthDate yoksa payload'da undefined (Prisma alanı null kalır)", async () => {
    await expect(runWithTenantAsync("t1", () => addStudent(baseStudent))).rejects.toBe(STOP);
    expect(mocks.create.mock.calls[0]![0].data.birthDate).toBeUndefined();
  });

  it("updateStudentProfile: aynı kural — güncelleme de UTC öğlen Date yazar", async () => {
    await expect(runWithTenantAsync("t1", () => updateStudentProfile("s1", { birthDate: "2012-05-01" }))).rejects.toBe(STOP);
    expect((mocks.updateMany.mock.calls[0]![0].data.birthDate as Date).toISOString()).toBe("2012-05-01T12:00:00.000Z");
  });
});

describe("toDateOnlyDbValue", () => {
  it("boş/undefined/null → undefined", () => {
    expect(toDateOnlyDbValue(undefined)).toBeUndefined();
    expect(toDateOnlyDbValue(null)).toBeUndefined();
    expect(toDateOnlyDbValue("")).toBeUndefined();
  });

  it("geçersiz değerler Prisma'ya Invalid Date olarak gitmez", () => {
    expect(toDateOnlyDbValue("2026-02-30")).toBeUndefined();
    expect(toDateOnlyDbValue("bozuk")).toBeUndefined();
  });

  it("tam ISO girdi (okuma mapping'inin çıktısı) aynen korunur — 369606b'nin Invalid Date hatası yok", () => {
    expect(toDateOnlyDbValue("2000-01-01T12:00:00.000Z")!.toISOString()).toBe("2000-01-01T12:00:00.000Z");
  });
});

describe("saat dilimi regresyonu", () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  for (const tz of ["Europe/Istanbul", "America/New_York", "UTC"]) {
    it(`${tz}: 2000-01-01 girilen doğum tarihi okunduğunda 1999-12-31/2000-01-02 görünmez`, () => {
      process.env.TZ = tz;
      // store-db okuma mapping'i ile AYNI: Date → toISOString()
      const readBack = toDateOnlyDbValue("2000-01-01")!.toISOString();
      expect(readBack.slice(0, 10)).toBe("2000-01-01"); // student-profile-editor
      expect(formatDate(readBack, "yyyy-MM-dd")).toBe("2000-01-01"); // öğrenci detay sayfası (yerel saat)
    });
  }
});

describe("validasyon — geçersiz doğum tarihi reddedilir", () => {
  const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
  const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
  const createInput = {
    name: "Validasyon Testi",
    email: "",
    phone: "5551234567",
    parentName: "Veli",
    parentPhone: "5559876543",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
    enrollmentStartDate: "2026-09-01",
  };

  beforeEach(async () => {
    await fs.rm(DATA_FILE, { force: true });
  });

  it("createStudentTool: takvimde olmayan tarih VALIDATION_ERROR, öğrenci oluşmaz", async () => {
    const res = await createStudentTool(ctx, { ...createInput, birthDate: "2026-02-30" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("createStudentTool: boş string eskisi gibi 'girilmedi' sayılır", async () => {
    const res = await createStudentTool(ctx, { ...createInput, birthDate: "" });
    expect(res.ok).toBe(true);
  });

  it("updateStudentProfileSchema: biçimsiz tarih reddedilir, geçerli tarih kabul edilir", () => {
    expect(updateStudentProfileSchema.safeParse({ studentId: "s1", birthDate: "01.01.2000" }).success).toBe(false);
    expect(updateStudentProfileSchema.safeParse({ studentId: "s1", birthDate: "2000-01-01" }).success).toBe(true);
  });
});
