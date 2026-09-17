/**
 * 2026-09-17 owner kararı — öğretmen yoklama ALAMAZ (öğrenci geldi/gelmedi,
 * İşlendi/Telafi işaretleri). UI'dan kaldırıldı; doğrudan API/mobil isteği de
 * tool katmanında Türkçe nedenle reddedilir. Yönetici aynı işlemleri yapar.
 * Müsaitlik yetkisi: teacher-availability-approval.test.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { markAttendanceTool, setLessonOpsFlagTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

async function ownPastLesson() {
  const data = await readData();
  const lesson = data.lessons.find((l) => l.status === "scheduled" && new Date(l.startAt) < new Date() && l.type === "regular");
  if (!lesson) throw new Error("seed: geçmiş planlı ders yok");
  const teacher: ServiceContext = { role: "TEACHER", userId: "teach1", tenantId: DEFAULT_TENANT_ID, teacherId: lesson.teacherId, channel: "web" };
  return { lesson, teacher };
}

describe("öğretmen yoklama alamaz", () => {
  it("markAttendanceTool: kendi dersi olsa bile FORBIDDEN + Türkçe neden; kayıt oluşmaz", async () => {
    const { lesson, teacher } = await ownPastLesson();
    const before = (await readData()).attendances.filter((a) => a.lessonId === lesson.id).length;
    const res = await markAttendanceTool(teacher, { lessonId: lesson.id, status: "present" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("FORBIDDEN");
      expect(res.error.message).toContain("yalnız kurum yöneticileri");
    }
    expect((await readData()).attendances.filter((a) => a.lessonId === lesson.id).length).toBe(before);
  });

  it("setLessonOpsFlagTool: Geldi/İşlendi/Telafi işaretleri reddedilir; ders değişmez", async () => {
    const { lesson, teacher } = await ownPastLesson();
    for (const flag of ["attended", "processed", "makeup"] as const) {
      const res = await setLessonOpsFlagTool(teacher, { lessonId: lesson.id, flag, reason: "test" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    }
    const after = (await readData()).lessons.find((l) => l.id === lesson.id)!;
    expect(after.studentAttended ?? false).toBe(false);
    expect(after.lessonProcessed ?? false).toBe(false);
  });

  it("yönetici aynı derste yoklama alabilir", async () => {
    const { lesson } = await ownPastLesson();
    const res = await setLessonOpsFlagTool(admin, { lessonId: lesson.id, flag: "attended" });
    expect(res.ok).toBe(true);
    expect((await readData()).lessons.find((l) => l.id === lesson.id)!.studentAttended).toBe(true);
  });
});
