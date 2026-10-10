/**
 * 10. tur iş #8 — sözleşme sonrası "Ders programını oluştur" adımında YALNIZ
 * aktif odalar. Sunucu (`planContractLessonScheduleTool`) pasif/silinmiş
 * odayı hem önizlemede hem oluşturmada ENGELLER (her çağrıda yeniden
 * doğrulanır); oda seçici pasifleri gizler. Geçmiş derslerin pasif oda
 * referansları korunur (bu test hiçbir geçmiş dersi değiştirmez).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentContractTool,
  planContractLessonScheduleTool,
  updateRoomTool,
  deleteRoomTool,
} from "../services/tools";
import { STUDENT_CONTRACTS_FILE } from "../contracts";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, rel), "utf-8");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_CONTRACTS_FILE, { force: true });
});

async function makeContract() {
  const { addRegistrationFirstPayment } = await import("../store-json");
  await addRegistrationFirstPayment({
    studentId: "s1",
    method: "cash",
    amount: 3000,
    collectedAt: "2026-09-01",
    receivedByUserId: "u1",
  });
  const res = await createStudentContractTool(admin, {
    studentId: "s1",
    contractType: "initial",
    programmeName: "Piyano",
    enrollmentStartDate: "2026-09-01T00:00:00.000Z",
    enrollmentEndDate: "2026-11-30T00:00:00.000Z",
    durationMonths: 3,
    monthlyAmount: 3000,
    installmentCount: 3,
    firstDueDate: "2026-09-01T00:00:00.000Z",
    signatoryFullName: "Selin Arslan",
    signatoryRelationship: "veli",
    lessonScheduleText: "Salı 14:00",
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("sözleşme kurulamadı");
  return res.data.contract.id;
}

describe("sunucu: pasif odaya ders oluşturulamaz", () => {
  it("aktif oda: önizleme + oluşturma çalışır", async () => {
    const contractId = await makeContract();
    const preview = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r1",
      dryRun: true,
      skipConflicts: true,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.slots.length).toBeGreaterThan(0);
    const before = (await readData()).lessons.length;
    const created = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r1",
      dryRun: false,
      skipConflicts: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.createdLessonIds.length).toBeGreaterThan(0);
    expect((await readData()).lessons.length).toBeGreaterThan(before);
  });

  it("pasif oda: önizleme ENGELLENİR, ders yazılmaz", async () => {
    const contractId = await makeContract();
    expect((await updateRoomTool(admin, { roomId: "r1", active: false })).ok).toBe(true);
    const before = (await readData()).lessons.length;
    const preview = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r1",
      dryRun: true,
      skipConflicts: true,
    });
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.error.code).toBe("VALIDATION_ERROR");
    expect(preview.error.message).toMatch(/pasif/);
    expect((await readData()).lessons.length).toBe(before);
  });

  it("pasif oda: GERÇEK oluşturma ENGELLENİR, ders yazılmaz", async () => {
    const contractId = await makeContract();
    expect((await updateRoomTool(admin, { roomId: "r1", active: false })).ok).toBe(true);
    const before = (await readData()).lessons.length;
    const created = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r1",
      dryRun: false,
      skipConflicts: true,
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("VALIDATION_ERROR");
    expect((await readData()).lessons.length).toBe(before);
  });

  it("silinmiş oda: ENGELLENİR", async () => {
    const contractId = await makeContract();
    // r3'te ders yok → silinebilir (pasife al + sil).
    expect((await updateRoomTool(admin, { roomId: "r3", active: false })).ok).toBe(true);
    await withTestCriticalPassword();
    const deleted = await deleteRoomTool(admin, { roomId: "r3", ...CRIT });
    expect(deleted.ok).toBe(true);
    const preview = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r3",
      dryRun: true,
      skipConflicts: true,
    });
    expect(preview.ok).toBe(false);
  });

  it("önizlemeden SONRA oda pasife alınırsa oluşturma yeniden doğrulamada ENGELLENİR", async () => {
    const contractId = await makeContract();
    const preview = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r1",
      dryRun: true,
      skipConflicts: true,
    });
    expect(preview.ok).toBe(true);
    // Kullanıcı önizlemeye bakarken başka biri odayı pasife aldı.
    expect((await updateRoomTool(admin, { roomId: "r1", active: false })).ok).toBe(true);
    const before = (await readData()).lessons.length;
    const created = await planContractLessonScheduleTool(admin, {
      contractId,
      teacherId: "t1",
      roomId: "r1",
      dryRun: false,
      skipConflicts: true,
    });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("VALIDATION_ERROR");
    expect((await readData()).lessons.length).toBe(before);
  });
});

describe("arayüz: oda seçici yalnız aktif odaları gösterir", () => {
  it("sözleşmeler sayfası pasif/silinmiş odayı listeden çıkarır", () => {
    const page = read("../../app/panel/ogrenciler/[studentId]/sozlesmeler/page.tsx");
    expect(page).toMatch(/rooms: data\.rooms\s*\n?\s*\.filter\(\(r\) => r\.active !== false && !r\.deletedAt\)/);
  });

  it("aktif oda yoksa açıklayıcı boş-durum gösterilir (sessiz boş select yok)", () => {
    const gen = read("../../components/contract-lesson-schedule-generator.tsx");
    expect(gen).toMatch(/rooms\.length > 0/);
    expect(gen).toMatch(/Aktif oda yok/);
  });
});
