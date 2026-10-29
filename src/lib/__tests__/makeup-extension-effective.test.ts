/**
 * 2026-10-24 — ACİL BUG repro: uzatılan telafi penceresi mevcut talepte dikkate alınmıyor.
 * Gerçek vaka (tarihler 2099'a ötelenmiş eşdeğer — duvar saati bağımsız):
 * kaynak ders 28 Ağu 12:00+03, talep bekliyor, kart son günü 10 Kas 14:26+03,
 * planlanmak istenen 14 Kas 16:40+03 reddediliyor ("son kullanım gününü aşıyor").
 * 10 Kas 14:26 değeri eski kuralın ürünüdür (işaretleme anı 28 Ağu 14:26 + 74 gün);
 * yeni kural kaynak ders çapalıdır (LESSONS_LEARNED #3).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData as readStored, writeData } from "../store-json";
import {
  confirmMakeupLessonTool,
  extendMakeupDeadlineTool,
  updateMakeupWindowDaysTool,
} from "../services/tools";
import { makeupPlanningDeadline } from "../makeup-deadline";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson, MakeupRequest } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const ctx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

// 28 Ağu 12:00+03 → 09:00Z; 10 Kas 14:26+03 → 11:26Z; 14 Kas 16:40+03 → 13:40Z.
const SOURCE_START = "2099-08-28T09:00:00.000Z";
const SOURCE_END = "2099-08-28T09:40:00.000Z";
const CREATED = "2099-08-28T11:26:00.000Z";
const OLD_EXPIRES = "2099-11-10T11:26:00.000Z";
const WANT_START = "2099-11-14T13:40:00.000Z";
const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, start: "00:00", end: "23:59" }));

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(path.join(DIR, "closed-days.json"), { force: true });
});

async function seedKubilay() {
  const base = await readStored();
  const teacher = base.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
  const room = base.rooms.find(
    (r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId && r.active !== false && !r.deletedAt
  )!;
  const student = base.students.find((s) => s.active !== false)!;
  const source: Lesson = {
    id: "l_kubilay_src",
    studentId: student.id,
    teacherId: teacher.id,
    roomId: room.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    startAt: SOURCE_START,
    endAt: SOURCE_END,
    type: "regular",
    status: "no_show",
    studentAbsent: true,
    opsMakeupFlag: true,
  };
  const req: MakeupRequest = {
    id: "mk_kubilay",
    studentId: student.id,
    teacherId: teacher.id,
    branchId: teacher.branchId,
    instrument: "Piyano",
    sourceLessonId: source.id,
    attendanceId: "att_kubilay",
    status: "pending",
    reason: "YAZ",
    expiresAt: OLD_EXPIRES,
    suggestedSlots: [],
    createdAt: CREATED,
    policyNote: "74 gün pencere",
  };
  const data: AppData = {
    ...base,
    settings: { ...base.settings, makeupWindowDays: 74 },
    teachers: base.teachers.map((t) => (t.id === teacher.id ? { ...t, availability: ALL_DAY, maxDailyLessons: 50 } : t)),
    lessons: [...base.lessons.filter((l) => l.id !== source.id), source],
    makeupRequests: [...base.makeupRequests.filter((m) => m.id !== req.id), req],
    attendances: [
      ...base.attendances.filter((a) => a.id !== "att_kubilay"),
      { id: "att_kubilay", lessonId: source.id, studentId: student.id, status: "absent", markedAt: CREATED, createsMakeupCredit: true },
    ],
  };
  await writeData(data);
  const slot = (startAt: string) => ({
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 40 * 60_000).toISOString(),
    teacherId: teacher.id,
    roomId: room.id,
    branchId: teacher.branchId,
    score: 0,
    reasons: ["Manuel planlama"],
  });
  return { req, teacher, room, student, source, slot };
}

describe("Kubilay vakası — raporlanan hata", () => {
  it("eski son günle 14 Kas planı AFTER_EXPIRY ile reddedilir", async () => {
    const { req, slot } = await seedKubilay();
    // Kart/form/sunucu aynı sınırı görür: ders bitişi planlama sınırını aşar.
    const end = new Date(new Date(WANT_START).getTime() + 40 * 60_000).getTime();
    expect(end > makeupPlanningDeadline(req.expiresAt).getTime()).toBe(true);
    const res = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot(WANT_START) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/son gün/);
  });

  it("genel pencere 74→84 uzatılınca mevcut bekleyen talep de uzar ve 14 Kas planlanır", async () => {
    const { req, slot } = await seedKubilay();
    const upd = await updateMakeupWindowDaysTool(ctx, { makeupWindowDays: 84 });
    expect(upd.ok).toBe(true);
    const after = await readStored();
    const open = after.makeupRequests.find((m) => m.id === req.id)!;
    // Yeni kural: kaynak ders + pencere (28 Ağu 09:00Z + 84 gün = 20 Kas 09:00Z).
    expect(open.expiresAt).toBe("2099-11-20T09:00:00.000Z");
    const res = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot(WANT_START) });
    expect(res.ok).toBe(true);
  });

  it("talebe özel uzatma (bekleyen talep) sonrası yeni sınır içi kabul, dışı ret", async () => {
    const { req, slot } = await seedKubilay();
    const ext = await extendMakeupDeadlineTool(ctx, { requestId: req.id, lastDayYmd: "2099-11-18" });
    expect(ext.ok ? "ok" : ext.error.message).toBe("ok");
    const after = await readStored();
    const open = after.makeupRequests.find((m) => m.id === req.id)!;
    expect(open.status).toBe("pending");
    expect(new Date(WANT_START).getTime() < makeupPlanningDeadline(open.expiresAt).getTime()).toBe(true);
    const okRes = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot(WANT_START) });
    expect(okRes.ok).toBe(true);
  });

  it("yetkisiz rol talebe özel uzatma yapamaz", async () => {
    const { req } = await seedKubilay();
    const denied = await extendMakeupDeadlineTool(
      { ...ctx, role: "TEACHER", teacherId: "t1" },
      { requestId: req.id, lastDayYmd: "2099-11-18" }
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");
  });

  it("uzatılan yeni sınırın dışı reddedilir (kart/öneri/yazım aynı sınır)", async () => {
    const { req, slot } = await seedKubilay();
    const ext = await extendMakeupDeadlineTool(ctx, { requestId: req.id, lastDayYmd: "2099-11-18" });
    expect(ext.ok ? "ok" : ext.error.message).toBe("ok");
    const after = await readStored();
    const open = after.makeupRequests.find((m) => m.id === req.id)!;
    // 18 Kas son gün → planlama sınırı 19 Kas 00:00 (+03). 19 Kas 10:00 dersi aşar.
    const outside = "2099-11-19T07:00:00.000Z";
    const end = new Date(new Date(outside).getTime() + 40 * 60_000).getTime();
    expect(end > makeupPlanningDeadline(open.expiresAt).getTime()).toBe(true);
    const res = await confirmMakeupLessonTool(ctx, { requestId: req.id, slot: slot(outside) });
    expect(res.ok).toBe(false);
  });

  it("gerçekleşmiş (completed) talep uzatmayla yeniden kullanılmaz", async () => {
    const { req } = await seedKubilay();
    const base = await readStored();
    await writeData({
      ...base,
      makeupRequests: base.makeupRequests.map((m) =>
        m.id === req.id ? { ...m, status: "completed" as const, confirmedLessonId: "l_done" } : m
      ),
    });
    const ext = await extendMakeupDeadlineTool(ctx, { requestId: req.id, lastDayYmd: "2099-12-31" });
    expect(ext.ok).toBe(false);
  });
});

describe("2026-10-24 — kanonik son gün: tek çapa + tek kalan-gün hesabı", () => {
  it("ops 'Telafi' işareti son günü kaynak dersten hesaplar (işaretleme anından değil)", async () => {
    const { switchLessonOpsFlag } = await import("../lesson-ops");
    const base = await readStored();
    const student = base.students.find(
      (s) => s.active !== false && !base.makeupRequests.some((m) => m.studentId === s.id)
    )!;
    const teacher = base.teachers.find((t) => t.active && t.instruments.includes("Piyano"))!;
    const room = base.rooms.find((r) => r.instruments.includes("Piyano") && r.branchId === teacher.branchId)!;
    const source: Lesson = {
      id: "l_anchor_src",
      studentId: student.id,
      teacherId: teacher.id,
      roomId: room.id,
      branchId: teacher.branchId,
      instrument: "Piyano",
      startAt: SOURCE_START,
      endAt: SOURCE_END,
      type: "regular",
      status: "no_show",
    };
    const data: AppData = {
      ...base,
      settings: { ...base.settings, makeupWindowDays: 30, monthlyMakeupAllowance: 31 },
      lessons: [...base.lessons.filter((l) => l.id !== source.id), source],
    };
    const res = switchLessonOpsFlag(data, source.id, "makeup", "u1", undefined, "YAZ");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const created = res.data.makeupRequests.find((m) => m.sourceLessonId === source.id)!;
    // Kaynak 28 Ağu 09:00Z + 30 gün = 27 Eyl 09:00Z (işaretleme anı 2026-Eki değil).
    expect(created.expiresAt).toBe("2099-09-27T09:00:00.000Z");
  });

  it("kalan gün kurum saat dilimindedir ve yazım sınırıyla aynı günü söyler", async () => {
    const { makeupDaysLeft, isPastMakeupPlanningDeadline } = await import("../makeup-deadline");
    // Son gün 10 Kas (+03). Kurumda 11 Kas 00:30 ama UTC'de hâlâ 10 Kas: sunucu-dilimli
    // hesap "Bugün son gün" derken yazım sınırı (11 Kas 00:00+03) çoktan kapanmıştır.
    const nowAt = new Date("2099-11-10T21:30:00.000Z");
    expect(makeupDaysLeft(OLD_EXPIRES, nowAt)).toBe(-1);
    expect(isPastMakeupPlanningDeadline(OLD_EXPIRES, nowAt)).toBe(true);
    // Son günün kurum-öğleninde 0, bir gün önce 1.
    expect(makeupDaysLeft(OLD_EXPIRES, new Date("2099-11-10T09:00:00.000Z"))).toBe(0);
    expect(makeupDaysLeft(OLD_EXPIRES, new Date("2099-11-09T09:00:00.000Z"))).toBe(1);
    // Bozuk girdi çökmez (eski NaN paritesi).
    expect(Number.isNaN(makeupDaysLeft("bozuk", new Date()))).toBe(true);
  });
});
