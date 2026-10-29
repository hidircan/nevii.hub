/**
 * 2026-09-29 — (a) ay bazlı hakediş politikası (mevcut / süreye göre sabit ücret),
 * (b) yoklama statüsünü geri alma. json STORE_MODE + tohum veri (s1/t1/r1).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  clearLessonOpsFlagTool,
  createLessonTool,
  createTeacherPayoutTool,
  setLessonOpsFlagTool,
  setTeacherPayoutPolicyTool,
} from "../services/tools";
import { readData } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { effectiveLessonOpsStatus } from "../lesson-ops";
import { computeTeacherEarningsForPeriod, setPayoutPolicyForMonthData } from "../teacher-payout";
import { validateLessonSlot } from "../makeup-engine";
import type { Lesson } from "../types";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const DATA_FILE = path.join(DIR, "store.json");
const CLOSED_DAYS_FILE = path.join(DIR, "closed-days.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(CLOSED_DAYS_FILE, { force: true });
});

async function createTestLesson(): Promise<string> {
  const data = await readData();
  for (let offset = 1; offset <= 14; offset++) {
    for (let hour = 9; hour <= 16; hour++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(hour, 0, 0, 0);
      if (d.getDay() === 1) continue;
      const startAt = d.toISOString();
      const check = validateLessonSlot(data, { instrument: "Piyano", studentId: "s1" }, { teacherId: "t1", roomId: "r1", startAt });
      if (!check.ok) continue;
      const res = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt });
      if (!res.ok) throw new Error(res.error.message);
      return res.data.lessonId;
    }
  }
  throw new Error("no open slot found");
}

const lessonOf = async (id: string) => (await readData()).lessons.find((l) => l.id === id)!;

describe("yoklama statüsünü geri alma", () => {
  it("Geldi geri alınır; ikinci (çift tıklama) istek idempotent no-op", async () => {
    const id = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId: id, flag: "attended" });
    const first = await clearLessonOpsFlagTool(ctx(), { lessonId: id, expected: "attended" });
    expect(first.ok && first.data.alreadyClear).toBe(false);
    const second = await clearLessonOpsFlagTool(ctx(), { lessonId: id, expected: "attended" });
    expect(second.ok && second.data.alreadyClear).toBe(true);
    expect(effectiveLessonOpsStatus(await lessonOf(id))).toBeNull();
    expect((await readData()).attendances.some((a) => a.lessonId === id)).toBe(false);
  });

  it("İşlendi geri alınınca ders completed → scheduled ve hakediş dışına çıkar", async () => {
    const id = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId: id, flag: "processed", reason: "Ders işlendi" });
    expect((await lessonOf(id)).status).toBe("completed");
    const res = await clearLessonOpsFlagTool(ctx(), { lessonId: id, expected: "processed" });
    expect(res.ok).toBe(true);
    const l = await lessonOf(id);
    expect(l.status).toBe("scheduled");
    expect(l.lessonProcessed).toBe(false);
  });

  it("Telafi geri alınınca bekleyen telafi talebi iptal edilir", async () => {
    const id = await createTestLesson();
    const set = await setLessonOpsFlagTool(ctx(), { lessonId: id, flag: "makeup", reason: "Öğrenci hasta" });
    expect(set.ok).toBe(true);
    const res = await clearLessonOpsFlagTool(ctx(), { lessonId: id, expected: "makeup" });
    expect(res.ok).toBe(true);
    const mk = (await readData()).makeupRequests.filter((m) => m.sourceLessonId === id);
    expect(mk.length).toBeGreaterThan(0);
    expect(mk.every((m) => m.status === "cancelled")).toBe(true);
  });

  it("ekrandaki statü eskiyse (sunucuda farklı) hiçbir şey değişmez", async () => {
    const id = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId: id, flag: "attended" });
    const res = await clearLessonOpsFlagTool(ctx(), { lessonId: id, expected: "processed" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFLICT");
    expect(effectiveLessonOpsStatus(await lessonOf(id))).toBe("attended");
  });

  it("öğretmen geri alamaz", async () => {
    const id = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId: id, flag: "attended" });
    const res = await clearLessonOpsFlagTool(ctx({ role: "TEACHER", teacherId: "t1" }), { lessonId: id, expected: "attended" });
    expect(res.ok).toBe(false);
  });

  it("dersin günü kayıtlı hakedişe düşüyorsa İşlendi geri alınamaz", async () => {
    const id = await createTestLesson();
    await setLessonOpsFlagTool(ctx(), { lessonId: id, flag: "processed", reason: "Ders işlendi" });
    const day = (await lessonOf(id)).startAt.slice(0, 10);
    const data = await readData();
    await writeData({
      ...data,
      teacherPayouts: [
        { id: "po1", teacherId: "t1", periodStart: day, periodEnd: day, totalMinutes: 30, totalAmount: 100, status: "paid", generatedAt: new Date().toISOString() },
      ],
    });
    const res = await clearLessonOpsFlagTool(ctx(), { lessonId: id, expected: "processed" });
    expect(res.ok).toBe(false);
    expect((await lessonOf(id)).lessonProcessed).toBe(true);
  });
});

describe("hakediş politikası — süreye göre sabit ücret", () => {
  function lesson(id: string, start: string, minutes: number): Lesson {
    const s = new Date(start);
    return {
      id,
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt: s.toISOString(),
      endAt: new Date(s.getTime() + minutes * 60_000).toISOString(),
      type: "regular",
      status: "completed",
      lessonProcessed: true,
    } as Lesson;
  }

  it("seçim yoksa mevcut politika aynen; sabit ücrette ders başı tutar; 30/40/50 dışı süre orantılı ve BLOKLAMAZ", async () => {
    const base = await readData();
    const data = {
      ...base,
      lessons: [lesson("x1", "2026-11-03T10:00:00Z", 30), lesson("x2", "2026-11-04T10:00:00Z", 50)],
    };
    const before = computeTeacherEarningsForPeriod(data, "t1", "2026-11-01", "2026-11-30");
    expect(before.pricingByMonth["2026-11"].policy).toBe("per_teacher_rule");

    const set = setPayoutPolicyForMonthData(data, { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 400, rate50: 500 }, "u1");
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const after = computeTeacherEarningsForPeriod(set.data, "t1", "2026-11-01", "2026-11-30");
    expect(after.totalAmount).toBe(800);
    expect(computeTeacherEarningsForPeriod(set.data, "t1", "2026-10-01", "2026-10-31").pricingByMonth["2026-10"].policy).toBe("per_teacher_rule");

    const odd = computeTeacherEarningsForPeriod({ ...set.data, lessons: [lesson("x3", "2026-11-05T10:00:00Z", 45)] }, "t1", "2026-11-01", "2026-11-30");
    expect(odd.unsupportedDurationLessonIds).toEqual(["x3"]);
    expect(odd.lines[0].amount).toBe(450); // 50 dk tarifesi × 45/50
    expect(odd.canCreatePayout).toBe(true);
  });

  it("eksik/geçersiz tutar reddedilir", async () => {
    const data = await readData();
    const res = setPayoutPolicyForMonthData(data, { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 0, rate50: 500 }, "u1");
    expect(res.ok).toBe(false);
  });

  it("tool: kayıt politikayı donmuş saklar; kilit YOK — ödemesiz kayıt yeni politikayla yeniden hesaplanır", async () => {
    const data = await readData();
    await writeData({ ...data, lessons: [...data.lessons, lesson("y1", "2026-11-03T10:00:00Z", 40)] });
    const set = await setTeacherPayoutPolicyTool(ctx(), { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 400, rate50: 500 });
    expect(set.ok).toBe(true);

    const created = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    expect(created.ok).toBe(true);
    const payout = (await readData()).teacherPayouts.find((p) => p.teacherId === "t1" && p.periodStart.startsWith("2026-11"))!;
    expect(payout.pricingPolicy).toBe("fixed_duration");
    expect(payout.pricingSnapshot?.["2026-11"]?.rate40).toBe(400);

    const preview = await setTeacherPayoutPolicyTool(ctx(), { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 450, rate50: 500, preview: true });
    expect(preview.ok && preview.data.impact.find((r) => r.teacherId === "t1")?.state).toBe("recalc");
    expect((await readData()).teacherPayouts.find((p) => p.id === payout.id)!.totalAmount).toBe(400); // önizleme yazmaz

    const applied = await setTeacherPayoutPolicyTool(ctx(), { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 450, rate50: 500 });
    expect(applied.ok && applied.data.recalculated).toBe(1);
    expect((await readData()).teacherPayouts.find((p) => p.id === payout.id)!.totalAmount).toBe(450);
  });

  it("öğretmen politika değiştiremez", async () => {
    const res = await setTeacherPayoutPolicyTool(ctx({ role: "TEACHER", teacherId: "t1" }), { month: "2026-11", policy: "per_teacher_rule" });
    expect(res.ok).toBe(false);
  });
});
