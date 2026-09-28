import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { clearInstrumentCatalog } from "../instrument-catalog";
import type { ServiceContext } from "../services/context";

/**
 * 11. tur iş #11 — öğrenci kayıt ekranı: doğum tarihi + T.C. kimlik alan
 * hataları KAYIPTI (sunucu `fieldErrors.birthDate`/`fieldErrors.nationalId`
 * üretiyordu ama formda render slotu yoktu) ve geçersiz T.C. kayıt SONRASI
 * `setNationalIdTool` yolunda sessizce düşüyordu (öğrenci oluşmuş, kimlik
 * kaybolmuş, kullanıcı kaydedildi sanıyordu).
 *
 * Kilitlenen davranış (actionAddStudent üzerinden, gerçek FormData ile):
 * 1. Geçersiz doğum tarihi → kayıt OLUŞMAZ, `fieldErrors.birthDate` Türkçe
 *    mesaj taşır (formdaki yeni slot bunu gösterir).
 * 2. Checksum'u tutmayan T.C. → kayıt OLUŞMAZ, `fieldErrors.nationalId`
 *    Türkçe mesaj taşır (kayıt-öncesi kapı).
 * 3. Geçerli T.C. (kanonik test kimliği 10000000146 — gerçek kişi DEĞİL) →
 *    kayıt oluşur ve kimlik ŞİFRELİ saklanır (cipher + son 2 hane; düz metin
 *    hiçbir alanda durmaz).
 * 4. Geçerli doğum tarihi aynen saklanır.
 */
const mockSession: { ctx: ServiceContext } = {
  ctx: { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" },
};
const mockCookieValue: { value: string | undefined } = { value: undefined };
const mockTenants: { list: { tenantId: string; name: string }[] } = { list: [] };

vi.mock("@/lib/auth/session", () => ({
  requireSessionContext: async () => mockSession.ctx,
  getSessionContext: async () => mockSession.ctx,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "notaplan_kurum" && mockCookieValue.value !== undefined
        ? { value: mockCookieValue.value }
        : undefined,
    set: () => {},
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    listTenants: async () => mockTenants.list,
  };
});

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const actions = await import("../actions");
const { readData } = await import("../store-json");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await clearInstrumentCatalog(DEFAULT_TENANT_ID);
  mockCookieValue.value = undefined;
  mockSession.ctx = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
  mockTenants.list = [{ tenantId: DEFAULT_TENANT_ID, name: "Nilüfer Açar Müzik Akademisi" }];
  vi.clearAllMocks();
});

function studentFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("name", "Kimlik Alan Testi");
  fd.set("parentName", "Veli");
  fd.set("parentPhone", "05550000001");
  fd.set("branchId", "erzene");
  fd.set("instrument", "Piyano");
  fd.set("teacherId", "t1");
  fd.set("firstPaymentMethod", "cash");
  fd.set("firstPaymentAmount", "3000");
  fd.set("firstPaymentDate", "2026-08-30");
  fd.set("enrollmentStartDate", "2026-09-01");
  fd.append("lessonDays", "4");
  for (const [k, v] of Object.entries(overrides ?? {})) fd.set(k, v);
  return fd;
}

describe("actionAddStudent — doğum tarihi alan hatası", () => {
  it("takvimde olmayan tarih kaydı engeller, fieldErrors.birthDate Türkçe mesaj taşır", async () => {
    const res = await actions.actionAddStudent(null, studentFormData({ birthDate: "2026-02-30" }));
    expect(res?.ok).toBe(false);
    if (!res || res.ok) return;
    expect(res.fieldErrors?.birthDate).toContain("Geçerli bir tarih");
    const data = await readData();
    expect(data.students.find((s) => s.name === "Kimlik Alan Testi")).toBeUndefined();
  });

  it("geçerli doğum tarihi aynen saklanır", async () => {
    await expect(actions.actionAddStudent(null, studentFormData({ birthDate: "2015-03-12" }))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    const data = await readData();
    expect(data.students.find((s) => s.name === "Kimlik Alan Testi")?.birthDate).toBe("2015-03-12");
  });
});

describe("actionAddStudent — T.C. checksum kapısı (kayıt öncesi)", () => {
  it("checksum'u tutmayan T.C. kaydı engeller, fieldErrors.nationalId taşır, öğrenci oluşmaz", async () => {
    const res = await actions.actionAddStudent(null, studentFormData({ nationalId: "12345678901" }));
    expect(res?.ok).toBe(false);
    if (!res || res.ok) return;
    expect(res.fieldErrors?.nationalId).toContain("T.C. kimlik no geçersiz");
    const data = await readData();
    expect(data.students.find((s) => s.name === "Kimlik Alan Testi")).toBeUndefined();
  });

  it("geçerli T.C. şifreli saklanır — düz metin hiçbir alanda durmaz", async () => {
    await expect(actions.actionAddStudent(null, studentFormData({ nationalId: "10000000146" }))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    const data = await readData();
    const created = data.students.find((s) => s.name === "Kimlik Alan Testi");
    expect(created?.nationalIdCipher).toBeTruthy();
    expect(created?.nationalIdLast2).toBe("46");
    // Düz metin T.C. kaydın hiçbir alanında yazmaz.
    expect(JSON.stringify(created)).not.toContain("10000000146");
  });
});
