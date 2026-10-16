import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  previewLessonSeriesTool,
  createLessonSeriesTool,
  cancelSeriesFromLessonTool,
  cancelEntireSeriesTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { listNotificationsForUser, NOTIFICATIONS_FILE } from "../notifications";
import { createLessonTool } from "../services/tools";
import { findOpenLessonSlot } from "./helpers/lesson-slot";
import type { ServiceContext } from "../services/context";
import type { AppData, Lesson } from "../types";
import { isWeeklyClosedDayForTerm } from "../attendance-calendar";

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

/**
 * "l14" seed dersi çakışma senaryosu için sabit bir referans olarak
 * kullanılıyordu — ama `l14`'ün tarihi seed'de "bugün + 2 gün" olarak
 * üretiliyor (bkz. src/lib/seed.ts lessonDefs). Test paketi tesadüfen bir
 * Cumartesi/Pazar çalıştırılırsa bu +2 gün bir Pazartesi'ye denk gelebilir;
 * o zaman buradan türetilen `weekday: 1` merkezi kapalı-gün kuralı yüzünden
 * (createLessonSeriesTool zod şeması) VALIDATION_ERROR ile reddedilir —
 * testin beklediği CONFLICT senaryosuna hiç ulaşılamaz. Bu ürün hatası
 * değil; test fixture'ının hangi günde çalıştırılırsa çalıştırılsın GEÇERLİ
 * bir haftanın gününe denk gelen bir çakışma dersi seçmesi gerekiyordu.
 * `l14` hâlâ tercih edilir (mevcut senaryo davranışı korunur); yalnızca
 * geçersiz bir güne denk gelirse aynı merkezi kuralla (`isWeeklyClosedDayForTerm`
 * — burada yeniden yazılmaz, doğrudan kullanılır) geçerli başka bir seed
 * dersine düşülür.
 */
function pickConflictSeedLesson(data: AppData): Lesson {
  const preferred = data.lessons.find((l) => l.id === "l14");
  const candidates = preferred ? [preferred, ...data.lessons] : data.lessons;
  const found = candidates.find((l) => !isWeeklyClosedDayForTerm(new Date(l.startAt)));
  if (!found) throw new Error("no valid (non-Monday) seed lesson found for conflict test");
  return found;
}

// Seed dersleri "bugün"e göre üretilir; çakışma tohumu (l14) gün/saat'e göre öğretmen müsaitliği dışına veya
// geçmişe düşünce test takvime bağlı kırılıyordu (2026-10 baseline). Saat, testin yazıldığı haftanın SALI
// sabahına sabitlenir — yalnız Date sahte, zamanlayıcılar gerçek (async store kilitleri etkilenmez).
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T06:00:00.000Z"));
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * Kök neden düzeltmesi — startsOn/endsOn eskiden sabit "2026-09-01"/"2026-09-15"
 * literal tarihleriydi (bkz. lesson-reassignment.test.ts'deki AYNI sınıf
 * düzeltme). Takvim bu tarihe ulaştığında serinin ilk oluşumu geçmişe düşer,
 * validateLessonSlot PAST_START ile reddeder ve createLessonSeriesTool
 * skipConflicts vermediğinden TÜM seri engellenir. Ürün davranışı doğru;
 * düzeltme testin HER ZAMAN bugünden en az bir hafta sonraki bir Salı'dan
 * başlamasını sağlamakta.
 */
const BASE_INPUT_WEEKDAY = 2; // Salı

function nextWeekdayAtLeastOneWeekOut(weekday: number): Date {
  const now = new Date();
  const daysAhead = ((weekday - now.getDay() + 7) % 7) + 7;
  const d = new Date(now);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const baseInputStartsOn = nextWeekdayAtLeastOneWeekOut(BASE_INPUT_WEEKDAY);
const baseInputEndsOn = new Date(baseInputStartsOn);
baseInputEndsOn.setDate(baseInputEndsOn.getDate() + 14);

const baseInput = {
  studentId: "s1",
  teacherId: "t1",
  roomId: "r1",
  branchId: "erzene",
  instrument: "Piyano",
  weekday: BASE_INPUT_WEEKDAY,
  startTime: "11:00",
  durationMinutes: 40,
  startsOn: ymd(baseInputStartsOn),
  endsOn: ymd(baseInputEndsOn),
};

describe("previewLessonSeriesTool", () => {
  it("hiçbir kayıt yazmadan Türkçe önizleme ve oluşum sayısını döner", async () => {
    const before = await readData();
    const res = await previewLessonSeriesTool(ctx(), baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.occurrenceCount).toBe(3);
    expect(res.data.conflictCount).toBe(0);
    expect(res.data.previewText).toContain("Zeynep Arslan");
    expect(res.data.previewText).toContain("3 ders oluşturulacak");

    const after = await readData();
    expect(after.lessonSeries.length).toBe(before.lessonSeries.length);
    expect(after.lessons.length).toBe(before.lessons.length);
  });

  it("var olmayan öğrenci için NOT_FOUND döner", async () => {
    const res = await previewLessonSeriesTool(ctx(), { ...baseInput, studentId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("veli/öğretmen rolü önizleme dahi yapamaz (FORBIDDEN)", async () => {
    const res = await previewLessonSeriesTool(ctx({ role: "TEACHER" }), baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("createLessonSeriesTool", () => {
  it("çakışma yoksa tüm dersleri oluşturur", async () => {
    const res = await createLessonSeriesTool(ctx(), baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.createdLessonIds).toHaveLength(3);

    const data = await readData();
    expect(data.lessonSeries.some((s) => s.id === res.data.seriesId)).toBe(true);
  });

  it("İş 4A — tek özet bildirim üretir (oluşum başına DEĞİL), öğretmene ulaşır", async () => {
    const res = await createLessonSeriesTool(ctx(), baseInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.createdLessonIds).toHaveLength(3);

    const notifications = await listNotificationsForUser({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_teacher_t1",
    });
    const seriesNotifications = notifications.filter((n) => n.kind === "lesson_planned");
    expect(seriesNotifications).toHaveLength(1);
    expect(seriesNotifications[0]?.body).toContain("3 ders");

    const otherTeacher = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t2" });
    expect(otherTeacher).toHaveLength(0);
  });

  it("varsayılan davranışta çakışma varsa CONFLICT döner, hiçbir kayıt yazılmaz", async () => {
    const data0 = await readData();
    const l14 = pickConflictSeedLesson(data0);
    const conflictInput = {
      ...baseInput,
      studentId: "s3",
      teacherId: l14.teacherId,
      roomId: l14.roomId,
      weekday: new Date(l14.startAt).getDay(),
      startTime: `${new Date(l14.startAt).getHours()}:00`,
      startsOn: l14.startAt.slice(0, 10),
      endsOn: l14.startAt.slice(0, 10),
    };
    const before = await readData();
    const res = await createLessonSeriesTool(ctx(), conflictInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("CONFLICT");
      expect(Array.isArray(res.error.details)).toBe(true);
    }
    const after = await readData();
    expect(after.lessons.length).toBe(before.lessons.length);
    expect(after.lessonSeries.length).toBe(before.lessonSeries.length);
  });

  it("skipConflicts=true ile yalnızca çakışmayanlar oluşur", async () => {
    const data0 = await readData();
    const l14 = pickConflictSeedLesson(data0);
    const conflictDate = l14.startAt.slice(0, 10);
    const input = {
      ...baseInput,
      studentId: "s3",
      teacherId: l14.teacherId,
      roomId: l14.roomId,
      weekday: new Date(l14.startAt).getDay(),
      startTime: `${new Date(l14.startAt).getHours()}:00`,
      startsOn: new Date(new Date(conflictDate).getTime() - 7 * 86400000).toISOString().slice(0, 10),
      endsOn: new Date(new Date(conflictDate).getTime() + 7 * 86400000).toISOString().slice(0, 10),
      skipConflicts: true,
    };
    const res = await createLessonSeriesTool(ctx(), input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.createdLessonIds.length).toBeGreaterThan(0);
    expect(res.data.skippedOccurrences.length).toBeGreaterThan(0);
  });

  it("veli rolü seri oluşturamaz (FORBIDDEN)", async () => {
    const res = await createLessonSeriesTool(ctx({ role: "STUDENT" }), baseInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("Pazartesi (weekday=1) için seri oluşturma zod tarafından reddedilir", async () => {
    const res = await createLessonSeriesTool(ctx(), { ...baseInput, weekday: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
    const data = await readData();
    expect(data.lessonSeries.length).toBe(0);
  });
});

describe("cancelSeriesFromLessonTool / cancelEntireSeriesTool", () => {
  it("'bu ders ve sonrası' geçmiş dersi korur, kalanları iptal eder", async () => {
    const created = await createLessonSeriesTool(ctx(), baseInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const secondId = created.data.createdLessonIds[1];
    const res = await cancelSeriesFromLessonTool(ctx(), { lessonId: secondId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.cancelledLessonIds).toContain(secondId);

    const data = await readData();
    const first = data.lessons.find((l) => l.id === created.data.createdLessonIds[0])!;
    expect(first.status).toBe("scheduled");
  });

  it("'tüm seri' iptali tüm gelecekteki dersleri kapatır", async () => {
    const created = await createLessonSeriesTool(ctx(), baseInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await cancelEntireSeriesTool(ctx(), { seriesId: created.data.seriesId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.cancelledLessonIds.length).toBe(created.data.createdLessonIds.length);

    const data = await readData();
    const series = data.lessonSeries.find((s) => s.id === created.data.seriesId)!;
    expect(series.status).toBe("cancelled");
  });

  it("öğretmen rolü seri iptal edemez (FORBIDDEN)", async () => {
    const created = await createLessonSeriesTool(ctx(), baseInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await cancelEntireSeriesTool(ctx({ role: "TEACHER" }), { seriesId: created.data.seriesId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("createLessonTool — İş 4A tekil ders bildirimi", () => {
  it("başarılı ders oluşturmada ilgili öğretmene tek bildirim gider", async () => {
    const data = await readData();
    const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
    const res = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt });
    expect(res.ok).toBe(true);

    const notifications = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t1" });
    expect(notifications.filter((n) => n.kind === "lesson_planned")).toHaveLength(1);
  });

  it("başarısız ders oluşturmada (oda çakışması) bildirim gitmez", async () => {
    const data = await readData();
    const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
    const first = await createLessonTool(ctx(), { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano", startAt });
    expect(first.ok).toBe(true);

    // aynı oda + aynı saat, farklı öğrenci/öğretmen — oda çakışması reddedilmeli.
    const conflict = await createLessonTool(ctx(), { studentId: "s3", teacherId: "t3", roomId: "r1", instrument: "Piyano", startAt });
    expect(conflict.ok).toBe(false);

    const notifications = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t3" });
    expect(notifications).toHaveLength(0);
  });
});
