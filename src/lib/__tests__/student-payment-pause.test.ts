import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentTool,
  pauseStudentLessonScheduleTool,
  reactivateStudentLessonScheduleTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(): ServiceContext {
  return { role: "TEACHER", userId: "u3", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function seedStudent() {
  const created = await createStudentTool(adminCtx(), {
    name: "Test Öğrenci",
    email: "",
    phone: "0555 111 2233",
    parentName: "Veli",
    parentPhone: "0555 111 2234",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("seed failed");
  return created.data.studentId;
}

describe("Nilüfer Acar politikası §1E — yetkili/gerekçeli ders programı duraklatma", () => {
  it("yetkili gerekçeli duraklatma sonrası öğrenci paymentPauseStatus='paused' olur, geçmiş silinmez", async () => {
    const studentId = await seedStudent();
    const res = await pauseStudentLessonScheduleTool(adminCtx(), {
      studentId,
      reason: "3 aydır ödeme yapılmadı, veliyle görüşüldü",
    });
    expect(res.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === studentId);
    expect(student?.paymentPauseStatus).toBe("paused");
    expect(student?.paymentPauseReason).toContain("ödeme yapılmadı");
    expect(student?.paymentPausedBy).toBe("u1");
    // Kayıt/enrollment durumu (active) etkilenmedi.
    expect(student?.active).toBe(true);
  });

  it("gerekçesiz duraklatma isteği reddedilir (VALIDATION_ERROR)", async () => {
    const studentId = await seedStudent();
    const res = await pauseStudentLessonScheduleTool(adminCtx(), { studentId, reason: "" });
    expect(res.ok).toBe(false);
  });

  it("öğretmen duraklatamaz — yalnızca SCHOOL_ADMIN/SUPER_ADMIN yetkilidir", async () => {
    const studentId = await seedStudent();
    const res = await pauseStudentLessonScheduleTool(teacherCtx(), { studentId, reason: "deneme" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("çift duraklatma (zaten paused iken tekrar) engellenir — yan etki üretmez", async () => {
    const studentId = await seedStudent();
    await pauseStudentLessonScheduleTool(adminCtx(), { studentId, reason: "ilk gerekçe" });
    const second = await pauseStudentLessonScheduleTool(adminCtx(), { studentId, reason: "ikinci gerekçe" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("CONFLICT");

    const data = await readData();
    const student = data.students.find((s) => s.id === studentId);
    expect(student?.paymentPauseReason).toContain("ilk gerekçe");
  });

  it("yetkili reaktivasyon sonrası alanlar temizlenir", async () => {
    const studentId = await seedStudent();
    await pauseStudentLessonScheduleTool(adminCtx(), { studentId, reason: "gecikmiş ödeme" });
    const reactivated = await reactivateStudentLessonScheduleTool(adminCtx(), { studentId });
    expect(reactivated.ok).toBe(true);

    const data = await readData();
    const student = data.students.find((s) => s.id === studentId);
    expect(student?.paymentPauseStatus).toBeUndefined();
    expect(student?.paymentPauseReason).toBeUndefined();
  });

  it("duraklatılmamış öğrenciyi reaktive etmeye çalışmak reddedilir", async () => {
    const studentId = await seedStudent();
    const res = await reactivateStudentLessonScheduleTool(adminCtx(), { studentId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFLICT");
  });

  it("olmayan öğrenci için NOT_FOUND döner", async () => {
    const res = await pauseStudentLessonScheduleTool(adminCtx(), { studentId: "nope", reason: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});
