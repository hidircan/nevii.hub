/**
 * 2026-09-30 — Telafi Merkezi: geçmiş tarihe telafi (alt sınır yok, üst sınır talebin son günü, yalnız açık
 * talep), boş planlama gerekçesi, yalnız aktif oda; geçmiş telafi yoklama girilmeden hakedişe girmez.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { addDays } from "date-fns";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { writeData } from "../store-json";
import { confirmMakeupLessonTool } from "../services/tools";
import { suggestMakeupSlots } from "../makeup-engine";
import { resolveLessonFinalStatus } from "../lesson-live-status";
import { computeTeacherEarningsForPeriod } from "../teacher-payout";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppData, MakeupRequest } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, start: "08:00", end: "22:00" }));

/** Kaçan ders 20 Eylül; telafi talebi AÇIK ve son günü gelecekte. */
async function setup(overrides: Partial<MakeupRequest> = {}) {
  const base = await readData();
  const teacher = base.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const room = base.rooms.find((r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId)!;
  const student = base.students.find((s) => s.active !== false)!;
  const req: MakeupRequest = {
    id: "mk_past",
    studentId: student.id,
    teacherId: teacher.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    sourceLessonId: "l_src",
    attendanceId: "att_src",
    status: "pending",
    reason: "Öğrenci hasta",
    expiresAt: addDays(new Date(), 20).toISOString(),
    suggestedSlots: [],
    createdAt: "2026-09-20T09:00:00.000Z",
    policyNote: "",
    ...overrides,
  };
  const data: AppData = {
    ...base,
    teachers: base.teachers.map((t) => (t.id === teacher.id ? { ...t, availability: ALL_DAY, maxDailyLessons: 20 } : t)),
    makeupRequests: [...base.makeupRequests, req],
  };
  await writeData(data);
  const slot = (startAt: string, roomId = room.id) => ({
    startAt,
    endAt: new Date(new Date(startAt).getTime() + base.settings.lessonDurationMinutes * 60_000).toISOString(),
    teacherId: teacher.id,
    roomId,
    branchId: teacher.branchId,
    score: 0,
    reasons: ["Manuel planlama"],
  });
  return { req, teacher, room, student, slot };
}

describe("geçmiş tarihe telafi", () => {
  it("geçmiş (kaçan dersten önce bile) tarihe, gerekçesiz kayıt; 'Planlanan telafi', yoklama yokken hakediş dışı", async () => {
    const { req, teacher, slot } = await setup();
    const res = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2026-09-10T08:00:00.000Z"), decisionNote: "" });
    expect(res.ok ? "ok" : res.error.message).toBe("ok");
    const data = await readData();
    const saved = data.makeupRequests.find((m) => m.id === req.id)!;
    expect(saved.status).toBe("confirmed");
    expect(saved.decisionNote).toBeUndefined(); // boş gerekçe sahte metinle doldurulmaz
    const lesson = data.lessons.find((l) => l.id === saved.confirmedLessonId)!;
    expect(lesson.startAt).toBe("2026-09-10T08:00:00.000Z");
    expect(lesson.type).toBe("makeup");
    expect(lesson.status).toBe("scheduled");
    expect(resolveLessonFinalStatus(lesson)).toBe("makeup_planned");
    const earnings = computeTeacherEarningsForPeriod(data, teacher.id, "2026-09-01", "2026-09-30");
    expect(earnings.lines.some((l) => l.lessonId === lesson.id)).toBe(false);
  });

  it("geçmiş tarihte gerçek çakışma (öğretmenin aynı saatte dersi) reddedilir", async () => {
    const { req, teacher, room, student, slot } = await setup();
    const data = await readData();
    await writeData({
      ...data,
      lessons: [
        ...data.lessons,
        { id: "busy", studentId: student.id, teacherId: teacher.id, roomId: room.id, branchId: teacher.branchId, instrument: "Piyano", startAt: "2026-09-10T08:00:00.000Z", endAt: "2026-09-10T08:40:00.000Z", type: "regular", status: "scheduled" },
      ],
    });
    const res = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2026-09-10T08:00:00.000Z") });
    expect(res.ok).toBe(false);
    expect((await readData()).makeupRequests.find((m) => m.id === req.id)!.status).toBe("pending");
  });

  it("son kullanım gününden sonrası ve süresi dolmuş talep planlanamaz", async () => {
    const { req, slot } = await setup();
    const late = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot(addDays(new Date(), 25).toISOString()) });
    expect(late.ok).toBe(false);

    await fs.rm(path.join(DIR, "store.json"), { force: true });
    const expired = await setup({ id: "mk_exp", expiresAt: "2026-09-25T00:00:00.000Z" });
    const res = await confirmMakeupLessonTool(ctx, { requestId: expired.req.id, slot: expired.slot("2026-09-22T08:00:00.000Z") });
    expect(res.ok).toBe(false);
  });

  it("pasif oda seçilemez (kayıtta red) ve şubede aktif oda yoksa başka şubeden öneri yapılmaz", async () => {
    const { req, room, slot } = await setup();
    const data = await readData();
    await writeData({ ...data, rooms: data.rooms.map((r) => (r.id === room.id ? { ...r, active: false } : r)) });
    const res = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot("2026-09-10T08:00:00.000Z") });
    expect(!res.ok && res.error.message).toMatch(/oda pasif/);

    const noBranchRooms = (await readData()) as AppData;
    const onlyOther: AppData = {
      ...noBranchRooms,
      rooms: noBranchRooms.rooms.map((r) => (r.branchId === req.branchId ? { ...r, active: false } : r)),
    };
    expect(suggestMakeupSlots(onlyOther, req, { maxSlots: 5 })).toEqual([]);
  });
});
