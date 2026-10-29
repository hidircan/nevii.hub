/**
 * 2026-10-04 — öğretmen müsaitliği uyarılı istisnası: normal ders ve telafi AYNI kural; yalnız müsaitlik aşılır,
 * öğretmen/oda/öğrenci çakışması asla aşılmaz; yetki sunucuda; telafi doğrulaması gerçek ders süresiyle.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { addDays } from "date-fns";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { writeData } from "../store-json";
import { confirmMakeupLessonTool, createLessonTool } from "../services/tools";
import { makeupDurationMinutes } from "../makeup-engine";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { zonedWallTimeToUtc, addDaysYmd, toZonedYmd } from "../timezone";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson, MakeupRequest } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const agent: ServiceContext = { role: "AI_AGENT", userId: "agent", tenantId: DEFAULT_TENANT_ID, channel: "mcp" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

/** Gelecekte açık bir Salı (kapalı gün kuralına takılmasın diye 2 hafta sonrası, haftanın 2. günü). */
function futureTuesday(): string {
  let ymd = addDaysYmd(toZonedYmd(new Date(), "Europe/Istanbul"), 14);
  while (new Date(`${ymd}T12:00:00Z`).getUTCDay() !== 2) ymd = addDaysYmd(ymd, 1);
  return ymd;
}

async function setup(opts: { windowEnd: string; sourceMinutes: number }) {
  const base = await readData();
  const teacher = base.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const room = base.rooms.find((r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId && r.active !== false)!;
  const student = base.students.find((s) => s.active !== false && s.branchId === teacher.branchId) ?? base.students[0]!;
  const day = futureTuesday();
  const srcStart = zonedWallTimeToUtc(addDaysYmd(day, -7), "10:00");
  const source: Lesson = {
    id: "l_src_ov",
    studentId: student.id,
    teacherId: teacher.id,
    roomId: room.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    startAt: srcStart.toISOString(),
    endAt: new Date(srcStart.getTime() + opts.sourceMinutes * 60_000).toISOString(),
    type: "regular",
    status: "scheduled",
  };
  const req: MakeupRequest = {
    id: "mk_ov",
    studentId: student.id,
    teacherId: teacher.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    sourceLessonId: source.id,
    attendanceId: "att_ov",
    status: "pending",
    reason: "Öğrenci hasta",
    expiresAt: addDays(new Date(), 40).toISOString(),
    suggestedSlots: [],
    createdAt: new Date().toISOString(),
    policyNote: "",
  };
  const data: AppData = {
    ...base,
    settings: { ...base.settings, lessonDurationMinutes: 50 },
    teachers: base.teachers.map((t) =>
      t.id === teacher.id
        ? { ...t, availability: [{ dayOfWeek: 2, start: "12:00", end: opts.windowEnd }], maxDailyLessons: 20 }
        : t
    ),
    lessons: [...base.lessons.filter((l) => !(l.teacherId === teacher.id || l.roomId === room.id || l.studentId === student.id)), source],
    makeupRequests: [...base.makeupRequests, req],
  };
  await writeData(data);
  const slot = (hm: string, minutes = opts.sourceMinutes, roomId = room.id) => {
    const start = zonedWallTimeToUtc(day, hm);
    return {
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
      teacherId: teacher.id,
      roomId,
      branchId: teacher.branchId,
      score: 0,
      reasons: ["Manuel planlama"],
    };
  };
  return { req, teacher, room, student, day, slot };
}

describe("telafi — gerçek ders süresiyle müsaitlik (kök neden)", () => {
  it("30 dk'lık dersin telafisi pencerenin son 30 dk'sına sığar (kurum varsayılanı 50 dk ile reddedilmez)", async () => {
    const { req, slot } = await setup({ windowEnd: "18:00", sourceMinutes: 30 });
    expect(makeupDurationMinutes(await readData(), req)).toBe(30);
    const res = await confirmMakeupLessonTool(admin, { requestId: req.id, slot: slot("17:30") });
    expect(res.ok ? "ok" : res.error.message).toBe("ok");
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === data.makeupRequests.find((m) => m.id === req.id)!.confirmedLessonId)!;
    expect((new Date(lesson.endAt).getTime() - new Date(lesson.startAt).getTime()) / 60_000).toBe(30);
    expect(lesson.availabilityOverride).toBeUndefined();
  });
});

describe("telafi — uyarılı müsaitlik istisnası", () => {
  it("müsaitlik dışı: onaysız CONFLICT + overridable; yönetici onayıyla planlanır ve iz kalır", async () => {
    const { req, slot } = await setup({ windowEnd: "18:00", sourceMinutes: 40 });
    const first = await confirmMakeupLessonTool(admin, { requestId: req.id, slot: slot("19:00") });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.code).toBe("CONFLICT");
    expect((first.error.details as { overridable?: boolean }).overridable).toBe(true);

    const second = await confirmMakeupLessonTool(admin, {
      requestId: req.id,
      slot: slot("19:00"),
      overrideAvailability: true,
      overrideReason: "Öğretmen ek saat verdi",
    });
    expect(second.ok ? "ok" : second.error.message).toBe("ok");
    const data = await readData();
    const lesson = data.lessons.find((l) => l.id === data.makeupRequests.find((m) => m.id === req.id)!.confirmedLessonId)!;
    expect(lesson.availabilityOverride?.by).toBe("u1");
  });

  it("müsaitlik bilgisi HİÇ girilmemiş öğretmende de aynı istisna çalışır", async () => {
    const { req, teacher, slot } = await setup({ windowEnd: "18:00", sourceMinutes: 40 });
    const data = await readData();
    await writeData({ ...data, teachers: data.teachers.map((t) => (t.id === teacher.id ? { ...t, availability: [] } : t)) });
    const blocked = await confirmMakeupLessonTool(admin, { requestId: req.id, slot: slot("14:00") });
    expect(!blocked.ok && (blocked.error.details as { overridable?: boolean }).overridable).toBe(true);
    const ok = await confirmMakeupLessonTool(admin, { requestId: req.id, slot: slot("14:00"), overrideAvailability: true });
    expect(ok.ok).toBe(true);
  });

  it("istisna öğretmen/öğrenci çakışmasını AŞAMAZ (kısmi örtüşme dahil)", async () => {
    const { req, teacher, room, student, day, slot } = await setup({ windowEnd: "18:00", sourceMinutes: 40 });
    const data = await readData();
    const busyStart = zonedWallTimeToUtc(day, "19:20"); // talep 19:00–19:40 ile kısmen örtüşür
    await writeData({
      ...data,
      lessons: [
        ...data.lessons,
        {
          id: "busy_ov",
          studentId: "baska_ogrenci",
          teacherId: teacher.id,
          roomId: room.id,
          branchId: teacher.branchId,
          instrument: "Piyano",
          startAt: busyStart.toISOString(),
          endAt: new Date(busyStart.getTime() + 40 * 60_000).toISOString(),
          type: "regular",
          status: "scheduled",
        },
      ],
    });
    const res = await confirmMakeupLessonTool(admin, { requestId: req.id, slot: slot("19:00"), overrideAvailability: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect((res.error.details as { overridable?: boolean }).overridable).toBe(false);
    expect((await readData()).makeupRequests.find((m) => m.id === req.id)!.status).toBe("pending");
    void student;
  });

  it("AI ajanı istisna bayrağı gönderse de reddedilir (frontend bayrağı tek başına yetmez)", async () => {
    const { req, slot } = await setup({ windowEnd: "18:00", sourceMinutes: 40 });
    const res = await confirmMakeupLessonTool(agent, { requestId: req.id, slot: slot("19:00"), overrideAvailability: true });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });
});

describe("normal ders — aynı yetki kuralı", () => {
  it("AI ajanı overrideAvailability ile ders yazamaz", async () => {
    const { teacher, room, student, day } = await setup({ windowEnd: "18:00", sourceMinutes: 40 });
    const res = await createLessonTool(agent, {
      studentId: student.id,
      teacherId: teacher.id,
      roomId: room.id,
      instrument: "Piyano",
      startAt: `${day}T19:00`,
      durationMinutes: 40,
      overrideAvailability: true,
    });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });
});
