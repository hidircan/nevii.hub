import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Yeni öğrenci kaydı artık tekil `paymentDueDay` yerine bir aralık
 * (`paymentDueRanges`, start-end) da kabul eder; verilirse birincil
 * kaynaktır, yoksa tekil günden geriye dönük tek-elemanlı aralık türetilir.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

function baseInput(extra?: Record<string, unknown>) {
  return {
    name: "Ödeme Aralığı Testi",
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
    ...extra,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

describe("createStudentTool — ödeme günü aralığı (Faz 1A)", () => {
  it("paymentDueRanges verilirse aynen kaydedilir (tekil paymentDueDay yoksayılır)", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ paymentDueDay: 20, paymentDueRanges: [{ start: 1, end: 5 }] })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { readData } = await import("../store");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId);
    expect(created?.paymentDueRanges).toEqual([{ start: 1, end: 5 }]);
  });

  it("yalnızca tekil paymentDueDay verilirse geriye dönük tek-elemanlı aralık üretilir", async () => {
    const res = await createStudentTool(ctx(), baseInput({ paymentDueDay: 10 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { readData } = await import("../store");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId);
    expect(created?.paymentDueRanges).toEqual([{ start: 10, end: 10 }]);
  });

  it("start bitişten büyükse VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createStudentTool(ctx(), baseInput({ paymentDueRanges: [{ start: 20, end: 5 }] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("aralık 1-31 sınırının dışındaysa reddedilir", async () => {
    const res = await createStudentTool(ctx(), baseInput({ paymentDueRanges: [{ start: 0, end: 32 }] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});
