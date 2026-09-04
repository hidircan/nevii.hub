import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Regresyon — `createStudentTool` girdi şeması (`studentSchema`) hem
 * `instrument` (tekil, doğrulama alanı) hem `instruments` (dizi, model
 * alanı) taşır. Daha önce `...studentInput` spread'i `instrument`'ı da
 * `addStudent`'a sızdırıyordu; bu, STORE_MODE=db'de "Unknown argument
 * `instrument`" hatasıyla TÜM öğrenci oluşturmayı kırıyordu (json/memory
 * modda sessizce yutulduğu için testlerde hiç görünmüyordu — bkz. demo CSV
 * seed script'inin ilk çalıştırmasında keşfedilen prod-mod hatası).
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

describe("createStudentTool — 'instrument' (tekil) alanı addStudent'a sızmaz", () => {
  it("oluşturulan öğrencide yalnızca 'instruments' (dizi) alanı vardır", async () => {
    const res = await createStudentTool(ctx(), {
      name: "Sızıntı Testi",
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
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { readData } = await import("../store");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId) as unknown as Record<string, unknown>;
    expect(created).toBeDefined();
    expect(created.instruments).toEqual(["Piyano"]);
    // Model dışı, sızmış "instrument" (tekil) alanı olmamalı.
    expect(Object.prototype.hasOwnProperty.call(created, "instrument")).toBe(false);
  });

  /**
   * Regresyon — "yeni öğrenci kaydında enstrüman seçimi Piyano dışına
   * değiştirilemiyor" raporu. Formdaki `StudentInstrumentTeacherFields`
   * (client) zaten controlled bir `<select value={instrument}>`; asıl kanıt
   * gereken yer BURASI — `createStudentTool`'un gönderilen `instrument`
   * değerini SESSİZCE "Piyano"ya düşürmediğini, GERÇEKTEN gönderileni
   * kaydettiğini doğrular (bkz. actions.ts `String(formData.get("instrument")
   * || "Piyano")` — yalnız BOŞ/eksikse "Piyano"ya düşer, dolu bir değeri
   * ASLA değiştirmemeli).
   */
  it("piyano DIŞINDA seçilen bir enstrüman (Gitar) sessizce Piyano'ya düşmeden kaydedilir", async () => {
    const res = await createStudentTool(ctx(), {
      name: "Enstrüman Testi",
      email: "",
      phone: "5551234568",
      parentName: "Veli",
      parentPhone: "5559876544",
      branchId: "erzene",
      instrument: "Gitar",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { readData } = await import("../store");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId) as unknown as Record<string, unknown>;
    expect(created).toBeDefined();
    expect(created.instruments).toEqual(["Gitar"]);
    expect(created.instruments).not.toEqual(["Piyano"]);
  });
});
