import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { applyLessonOpsFlag, isLessonProcessedForPayout } from "../lesson-ops";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

/** store-json.ts'in kendi çözdüğü dosya yoluyla aynı — VERCEL=1 test ortamında /tmp'e yönlenir. */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function createTestLesson(): Promise<string> {
  const data = await readData();
  const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
  const res = await createLessonTool(ctx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.lessonId;
}

describe("Geldi/İşlendi/Telafi — applyLessonOpsFlag (saf mantık)", () => {
  it("yalnız Geldi işaretlenirse yalnız Geldi set edilir, İşlendi/Telafi etkilenmez", async () => {
    const data = await readData();
    const lessonId = await createTestLesson();
    const after = await readData();
    const result = applyLessonOpsFlag(after, lessonId, "attended", "u1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lesson = result.lesson;
    expect(lesson.studentAttended).toBe(true);
    expect(lesson.lessonProcessed).toBeFalsy();
    expect(lesson.opsMakeupFlag).toBeFalsy();
    void data;
  });

  it("yalnız İşlendi işaretlenirse ders status=completed olur, Geldi/Telafi etkilenmez", async () => {
    const lessonId = await createTestLesson();
    const data = await readData();
    const result = applyLessonOpsFlag(data, lessonId, "processed", "u1", undefined, "Ders fiilen işlendi");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.lessonProcessed).toBe(true);
    expect(result.lesson.lessonProcessedReason).toBe("Ders fiilen işlendi");
    expect(result.lesson.status).toBe("completed");
    expect(result.lesson.studentAttended).toBeFalsy();
    expect(result.lesson.opsMakeupFlag).toBeFalsy();
  });

  it("Geldi + İşlendi birlikte işaretlenebilir — birbirini dışlamaz", async () => {
    const lessonId = await createTestLesson();
    let data = await readData();
    const r1 = applyLessonOpsFlag(data, lessonId, "attended", "u1");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    data = r1.data;
    const r2 = applyLessonOpsFlag(data, lessonId, "processed", "u1", undefined, "Ders fiilen işlendi");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.lesson.studentAttended).toBe(true);
    expect(r2.lesson.lessonProcessed).toBe(true);
  });

  it("Telafi işaretlenirse opsMakeupFlag set edilir ve bir MakeupRequest oluşur", async () => {
    const lessonId = await createTestLesson();
    const data = await readData();
    const result = applyLessonOpsFlag(data, lessonId, "makeup", "u1", undefined, "Öğrenci hastaydı");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.opsMakeupFlag).toBe(true);
    const mk = result.data.makeupRequests.find((m) => m.sourceLessonId === lessonId);
    expect(mk).toBeDefined();
    expect(mk?.status).toBe("pending");
    expect(mk?.reason).toBe("Öğrenci hastaydı");
  });

  it("İşlendi/Telafi gerekçesiz reddedilir (P0-2)", async () => {
    const lessonId = await createTestLesson();
    const data = await readData();
    const processedNoReason = applyLessonOpsFlag(data, lessonId, "processed", "u1");
    expect(processedNoReason.ok).toBe(false);
    const processedBlankReason = applyLessonOpsFlag(data, lessonId, "processed", "u1", undefined, "   ");
    expect(processedBlankReason.ok).toBe(false);
    const makeupNoReason = applyLessonOpsFlag(data, lessonId, "makeup", "u1");
    expect(makeupNoReason.ok).toBe(false);
  });

  it("aynı bayrak tekrar uygulanırsa idempotent döner (alreadySet=true), veri değişmez", async () => {
    const lessonId = await createTestLesson();
    let data = await readData();
    const first = applyLessonOpsFlag(data, lessonId, "attended", "u1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    data = first.data;
    const attendanceCountBefore = data.attendances.filter((a) => a.lessonId === lessonId).length;

    const second = applyLessonOpsFlag(data, lessonId, "attended", "u1");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadySet).toBe(true);
    expect(second.data.attendances.filter((a) => a.lessonId === lessonId).length).toBe(
      attendanceCountBefore
    );
  });

  it("Telafi tekrar çağrılırsa ikinci bir MakeupRequest OLUŞTURULMAZ", async () => {
    const lessonId = await createTestLesson();
    let data = await readData();
    const first = applyLessonOpsFlag(data, lessonId, "makeup", "u1", undefined, "Öğrenci hastaydı");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    data = first.data;
    const second = applyLessonOpsFlag(data, lessonId, "makeup", "u1", undefined, "Öğrenci hastaydı");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadySet).toBe(true);
    const makeupCount = second.data.makeupRequests.filter((m) => m.sourceLessonId === lessonId).length;
    expect(makeupCount).toBe(1);
  });

  it("bulunamayan ders için ok:false döner (uydurma kayıt oluşturmaz)", async () => {
    const data = await readData();
    const result = applyLessonOpsFlag(data, "nonexistent-lesson-id", "attended", "u1");
    expect(result.ok).toBe(false);
  });
});

describe("isLessonProcessedForPayout — hakediş/rapor kaynağı", () => {
  it("lessonProcessed=true iken status ne olursa olsun true döner", () => {
    expect(isLessonProcessedForPayout({ status: "scheduled", lessonProcessed: true })).toBe(true);
    expect(isLessonProcessedForPayout({ status: "cancelled", lessonProcessed: true })).toBe(true);
  });

  it("lessonProcessed=false iken status'tan bağımsız false döner (legacy completed'a düşmez)", () => {
    expect(isLessonProcessedForPayout({ status: "completed", lessonProcessed: false })).toBe(false);
  });

  it("lessonProcessed hiç set edilmemişse (undefined) legacy status='completed' esas alınır", () => {
    expect(isLessonProcessedForPayout({ status: "completed", lessonProcessed: undefined })).toBe(true);
    expect(isLessonProcessedForPayout({ status: "scheduled", lessonProcessed: undefined })).toBe(false);
  });
});

describe("setLessonOpsFlagTool — RBAC ve sahiplik (API/tool katmanı)", () => {
  it("PARENT rolü yetkisizdir (FORBIDDEN)", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx({ role: "STUDENT", teacherId: undefined }), {
      lessonId,
      flag: "attended",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT rolü yetkisizdir (FORBIDDEN)", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx({ role: "STUDENT", teacherId: undefined }), {
      lessonId,
      flag: "processed",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER yalnızca KENDİ dersinde işlem yapabilir — başka öğretmenin dersinde FORBIDDEN (IDOR koruması)", async () => {
    const lessonId = await createTestLesson(); // t1'e ait
    const res = await setLessonOpsFlagTool(ctx({ role: "TEACHER", teacherId: "t2", userId: "teacher2" }), {
      lessonId,
      flag: "attended",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER kendi dersinde bile yoklama işaretleyemez (2026-09-17 owner kararı: yoklama yalnız yöneticide)", async () => {
    const lessonId = await createTestLesson(); // t1'e ait
    const res = await setLessonOpsFlagTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "teacher1" }), {
      lessonId,
      flag: "attended",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN/SUPER_ADMIN herhangi bir derste işlem yapabilir", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx({ role: "SUPER_ADMIN" }), {
      lessonId,
      flag: "processed",
      reason: "Ders fiilen işlendi",
    });
    expect(res.ok).toBe(true);
  });

  it("gerekçesiz 'İşlendi' backend tarafından reddedilir (P0-2)", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("yalnız boşluklardan oluşan gerekçe de reddedilir (P0-2)", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "processed", reason: "   " });
    expect(res.ok).toBe(false);
  });

  it("olmayan bir lessonId için NOT_FOUND döner, hiçbir kayıt sızdırmaz", async () => {
    const res = await setLessonOpsFlagTool(ctx(), { lessonId: "does-not-exist", flag: "attended" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("API/tool katmanında tekrar çağrı idempotent döner (alreadySet=true, hata değil)", async () => {
    const lessonId = await createTestLesson();
    const first = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(first.ok).toBe(true);
    const second = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.alreadySet).toBe(true);
  });

  it("geçersiz flag değeri zod tarafından reddedilir", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "invalid-flag" });
    expect(res.ok).toBe(false);
  });
});
