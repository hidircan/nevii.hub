/**
 * 2026-10-06 — Tekrarlayan ders serisinde öğretmen müsaitliği istisnası: önizleme ve oluşturma aynı kural;
 * yalnız yetkili yönetici + gerekçe; gerçek çakışma asla aşılmaz; tekrar denemede mükerrer seri yok.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { writeData } from "../store-json";
import { createLessonSeriesTool, previewLessonSeriesTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { zonedWallTimeToUtc, addDaysYmd, toZonedYmd } from "../timezone";
import type { ServiceContext } from "../services/context";
import type { Lesson } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const teacherCtx: ServiceContext = { role: "TEACHER", userId: "ut", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

function futureTuesday(): string {
  let ymd = addDaysYmd(toZonedYmd(new Date(), "Europe/Istanbul"), 14);
  while (new Date(`${ymd}T12:00:00Z`).getUTCDay() !== 2) ymd = addDaysYmd(ymd, 1);
  return ymd;
}

async function setup() {
  const base = await readData();
  const teacher = base.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const room = base.rooms.find((r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId && r.active !== false)!;
  const student = base.students.find((s) => s.active !== false && s.branchId === teacher.branchId) ?? base.students[0]!;
  const startsOn = futureTuesday();
  const endsOn = addDaysYmd(startsOn, 14); // 3 Salı
  await writeData({
    ...base,
    teachers: base.teachers.map((t) =>
      t.id === teacher.id ? { ...t, availability: [{ dayOfWeek: 2, start: "12:00", end: "18:00" }], maxDailyLessons: 20 } : t
    ),
    lessons: base.lessons.filter((l) => !(l.teacherId === teacher.id || l.roomId === room.id || l.studentId === student.id)),
  });
  const params = {
    studentId: student.id,
    teacherId: teacher.id,
    roomId: room.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    weekday: 2,
    startTime: "19:00",
    durationMinutes: 40,
    startsOn,
    endsOn,
  };
  return { params, teacher, room, student, startsOn };
}

describe("seri — müsaitlik istisnası", () => {
  it("onaysız: 3 tarih 'müsait değil' olarak raporlanır ve seri oluşturulmaz", async () => {
    const { params } = await setup();
    const pv = await previewLessonSeriesTool(admin, params);
    expect(pv.ok).toBe(true);
    if (!pv.ok) return;
    expect(pv.data.availabilityConflictCount).toBe(3);
    expect(pv.data.canOverrideAvailability).toBe(true);
    const cr = await createLessonSeriesTool(admin, params);
    expect(cr.ok).toBe(false);
    expect((await readData()).lessonSeries.filter((s) => s.studentId === params.studentId && s.status === "active")).toHaveLength(0);
  });

  it("gerekçesiz istisna reddedilir; öğretmen rolü istisna (ve seri) yapamaz", async () => {
    const { params } = await setup();
    const noReason = await createLessonSeriesTool(admin, { ...params, overrideAvailability: true });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.code).toBe("VALIDATION_ERROR");
    const asTeacher = await createLessonSeriesTool(teacherCtx, { ...params, overrideAvailability: true, overrideReason: "deneme" });
    expect(asTeacher.ok).toBe(false);
    if (!asTeacher.ok) expect(asTeacher.error.code).toBe("FORBIDDEN");
    const pvTeacher = await previewLessonSeriesTool(teacherCtx, { ...params, overrideAvailability: true });
    expect(pvTeacher.ok).toBe(false);
  });

  it("onaylı istisna: önizleme = oluşturma; 3 ders yazılır, iz (kim) kalır; tekrar denemede mükerrer seri yok", async () => {
    const { params } = await setup();
    const input = { ...params, overrideAvailability: true, overrideReason: "Öğretmenle ek saat anlaşıldı" };
    const pv = await previewLessonSeriesTool(admin, input);
    expect(pv.ok).toBe(true);
    if (!pv.ok) return;
    expect(pv.data.conflictCount).toBe(0);
    expect(pv.data.overriddenCount).toBe(3);

    const cr = await createLessonSeriesTool(admin, input);
    expect(cr.ok ? "ok" : cr.error.message).toBe("ok");
    if (!cr.ok) return;
    expect(cr.data.createdLessonIds).toHaveLength(3);
    expect(cr.data.skippedOccurrences).toHaveLength(0);
    const lessons = (await readData()).lessons.filter((l) => l.seriesId === cr.data.seriesId);
    expect(lessons.every((l) => l.availabilityOverride?.by === "u1")).toBe(true);

    const retry = await createLessonSeriesTool(admin, input);
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error.code).toBe("CONFLICT");
    const after = await readData();
    expect(after.lessons.filter((l) => l.studentId === params.studentId && l.status !== "cancelled")).toHaveLength(3);
  });

  it("istisna gerçek çakışmayı AŞAMAZ: dolu tarih çakışma olarak kalır, seri bloklanır", async () => {
    const { params, teacher, room, student, startsOn } = await setup();
    const data = await readData();
    const start = zonedWallTimeToUtc(addDaysYmd(startsOn, 7), "19:00");
    const busy: Lesson = {
      id: "l_busy",
      studentId: data.students.find((s) => s.id !== student.id)!.id,
      teacherId: teacher.id,
      roomId: data.rooms.find((r) => r.id !== room.id && r.branchId === teacher.branchId)?.id ?? room.id,
      branchId: teacher.branchId,
      instrument: "Piyano",
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 40 * 60_000).toISOString(),
      type: "regular",
      status: "scheduled",
    };
    await writeData({ ...data, lessons: [...data.lessons, busy] });
    const input = { ...params, overrideAvailability: true, overrideReason: "Ek saat" };
    const pv = await previewLessonSeriesTool(admin, input);
    expect(pv.ok).toBe(true);
    if (!pv.ok) return;
    expect(pv.data.conflictCount).toBe(1);
    expect(pv.data.overriddenCount).toBe(2);
    const cr = await createLessonSeriesTool(admin, input);
    expect(cr.ok).toBe(false);
  });
});
