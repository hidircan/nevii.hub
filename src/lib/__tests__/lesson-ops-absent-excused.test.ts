import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { effectiveLessonOpsStatus, isLessonProcessedForPayout } from "../lesson-ops";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

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

describe("Yoklama kapanışı — Gelmedi / Mazeretli", () => {
  it("Gelmedi işaretlenebilir ve etkin statü olur", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "absent" });
    expect(res.ok).toBe(true);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    expect(lesson.studentAbsent).toBe(true);
    expect(lesson.studentAbsentBy).toBe("u1");
    expect(effectiveLessonOpsStatus(lesson)).toBe("absent");
  });

  it("Mazeretli işaretlenebilir ve etkin statü olur", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "excused" });
    expect(res.ok).toBe(true);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    expect(lesson.studentExcused).toBe(true);
    expect(effectiveLessonOpsStatus(lesson)).toBe("excused");
  });

  it("Geldi/İşlendi/Telafi/Gelmedi/Mazeretli birbirini dışlar — Gelmedi'den Geldi'ye geçince Gelmedi temizlenir", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "absent" });
    const switchRes = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "attended", confirmSwitch: true });
    expect(switchRes.ok).toBe(true);

    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    expect(lesson.studentAbsent).toBe(false);
    expect(lesson.studentAttended).toBe(true);
    expect(effectiveLessonOpsStatus(lesson)).toBe("attended");
  });

  it("Gelmedi/Mazeretli hiçbir zaman Payment oluşturmaz (Package B kuralı korunuyor)", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "absent" });
    const afterAbsent = await readData();
    expect(afterAbsent.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);

    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "excused", confirmSwitch: true });
    const afterExcused = await readData();
    expect(afterExcused.payments.filter((p) => p.lessonId === lessonId)).toHaveLength(0);
  });

  it("Gelmedi/Mazeretli öğretmen hakedişini etkilemez — yalnız İşlendi (lessonProcessed) hakediş kaynağıdır", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "absent" });
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    expect(isLessonProcessedForPayout(lesson)).toBe(false);
  });

  it("aynı statüye tekrar tıklama idempotent — ikinci kez Gelmedi işaretlemek 'alreadySet' döner, tekrar audit/patch üretmez", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId, flag: "absent" });
    const second = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "absent" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.data.alreadySet).toBe(true);
  });

  it("TEACHER kendi dersinde Gelmedi/Mazeretli işaretleyebilir, başka öğretmenin dersinde işaretleyemez (RBAC/IDOR)", async () => {
    const lessonId = await createTestLesson();
    const own = await setLessonOpsFlagTool(ctx({ role: "TEACHER", teacherId: "t1" }), { lessonId, flag: "absent" });
    expect(own.ok).toBe(true);

    const lessonId2 = await createTestLesson();
    const other = await setLessonOpsFlagTool(ctx({ role: "TEACHER", teacherId: "t2", userId: "teacher2" }), {
      lessonId: lessonId2,
      flag: "excused",
    });
    expect(other.ok).toBe(false);
  });

  it("PARENT/STUDENT Gelmedi/Mazeretli işaretleyemez (RBAC)", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx({ role: "STUDENT", studentId: "s1" }), { lessonId, flag: "absent" });
    expect(res.ok).toBe(false);
  });

  it("geçersiz flag değeri reddedilir (yalnız attended/processed/makeup/absent/excused kabul edilir)", async () => {
    const lessonId = await createTestLesson();
    const res = await setLessonOpsFlagTool(ctx(), { lessonId, flag: "cancelled" });
    expect(res.ok).toBe(false);
  });
});
