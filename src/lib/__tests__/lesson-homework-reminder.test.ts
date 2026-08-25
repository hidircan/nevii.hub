import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonTool, setLessonOpsFlagTool, createHomeworkTool, listNotificationsTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { HOMEWORK_FILE_PATH } from "../homework";
import { LESSON_HOMEWORK_REMINDER_LOG_FILE, recordHomeworkReminderIfNew } from "../lesson-homework-reminder-log";
import { NOTIFICATIONS_FILE } from "../notifications";
import { findOpenLessonSlot } from "./helpers/lesson-slot";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "TEACHER",
    userId: "user_teacher_t1",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t1",
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(LESSON_HOMEWORK_REMINDER_LOG_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

async function createTestLesson(): Promise<string> {
  const data = await readData();
  const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
  const res = await createLessonTool(adminCtx(), {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    instrument: "Piyano",
    startAt,
  });
  if (!res.ok) throw new Error(res.error.message);
  return res.data.lessonId;
}

describe("recordHomeworkReminderIfNew — idempotent tekilleştirme", () => {
  it("aynı ders için ikinci çağrı false döner", async () => {
    const first = await recordHomeworkReminderIfNew(DEFAULT_TENANT_ID, "lesson-x");
    const second = await recordHomeworkReminderIfNew(DEFAULT_TENANT_ID, "lesson-x");
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});

describe("createHomeworkTool — lessonId eşleşme doğrulaması", () => {
  it("lessonId başka bir öğrenciye aitse reddedilir (her iki öğrenci de t1'in kendi öğrencisi olsa bile)", async () => {
    const lessonId = await createTestLesson(); // s1/t1
    // s5 de t1'in kendi öğrencisi (seed.ts) — sahiplik kontrolünü geçer, yalnız lessonId eşleşmesi başarısız olmalı.
    const res = await createHomeworkTool(teacherCtx(), {
      studentId: "s5",
      title: "Gam çalışması",
      description: "x",
      dueDate: "2026-09-01T00:00:00.000Z",
      lessonId,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("olmayan bir lessonId reddedilir", async () => {
    const res = await createHomeworkTool(teacherCtx(), {
      studentId: "s1",
      title: "Gam çalışması",
      description: "x",
      dueDate: "2026-09-01T00:00:00.000Z",
      lessonId: "does-not-exist",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("eşleşen lessonId ile ödev başarıyla oluşturulur", async () => {
    const lessonId = await createTestLesson();
    const res = await createHomeworkTool(teacherCtx(), {
      studentId: "s1",
      title: "Gam çalışması",
      description: "x",
      dueDate: "2026-09-01T00:00:00.000Z",
      lessonId,
    });
    expect(res.ok).toBe(true);
  });
});

describe("setLessonOpsFlagTool → checkAndNotifyMissingHomework entegrasyonu", () => {
  it("ödevsiz bir ders işlendi olarak işaretlenince öğretmene TEK bildirim düşer", async () => {
    const lessonId = await createTestLesson();
    await setLessonOpsFlagTool(adminCtx(), { lessonId, flag: "processed" });

    const list1 = await listNotificationsTool(teacherCtx());
    expect(list1.ok).toBe(true);
    if (!list1.ok) return;
    const missing1 = list1.data.notifications.filter((n) => n.kind === "homework_missing_for_lesson");
    expect(missing1).toHaveLength(1);

    // Aynı ders tekrar "işlendi" olarak işaretlenmeye çalışılırsa (idempotent no-op) — ikinci bildirim OLUŞMAZ.
    await setLessonOpsFlagTool(adminCtx(), { lessonId, flag: "processed" });
    const list2 = await listNotificationsTool(teacherCtx());
    expect(list2.ok).toBe(true);
    if (!list2.ok) return;
    const missing2 = list2.data.notifications.filter((n) => n.kind === "homework_missing_for_lesson");
    expect(missing2).toHaveLength(1);
  });

  it("ödevi olan bir ders işlendi olarak işaretlenince bildirim OLUŞMAZ", async () => {
    const lessonId = await createTestLesson();
    const hw = await createHomeworkTool(teacherCtx(), {
      studentId: "s1",
      title: "Gam çalışması",
      description: "x",
      dueDate: "2026-09-01T00:00:00.000Z",
      lessonId,
    });
    expect(hw.ok).toBe(true);

    await setLessonOpsFlagTool(adminCtx(), { lessonId, flag: "processed" });

    const list = await listNotificationsTool(teacherCtx());
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const missing = list.data.notifications.filter((n) => n.kind === "homework_missing_for_lesson");
    expect(missing).toHaveLength(0);
  });
});
