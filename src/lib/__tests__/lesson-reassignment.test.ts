import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createLessonSeriesTool, changeLessonTeacherOrBranchTool, createLessonTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { NOTIFICATIONS_FILE } from "../notifications";
import type { ServiceContext } from "../services/context";
import { teacherServesBranch } from "../teacher-branches";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

/**
 * Kök neden düzeltmesi — startsOn/endsOn eskiden sabit "2026-09-01"/"2026-09-15"
 * literal tarihleriydi. Takvim bu tarihe ulaştığında (paket tam o gün ya da
 * sonrasında çalıştırıldığında) serinin ilk oluşumu "bugün, saat 13:00" olur
 * ve gün ilerledikçe bu saat GEÇMİŞE düşer — validateLessonSlot PAST_START
 * ile reddeder; createLessonSeriesTool skipConflicts vermediğinden TEK bir
 * geçmiş oluşum bile TÜM seriyi engeller (bkz. lesson-series.ts
 * createLessonSeriesData — "TEK bir çakışma bile tüm seriyi engeller").
 * Bu ÜRÜN davranışı doğru (geçmişe ders planlanamaz) — düzeltme burada,
 * testin HER ZAMAN bugünden en az bir hafta sonraki bir Salı'dan başlamasını
 * sağlamakta; hangi gün/saatte çalıştırılırsa çalıştırılsın asla geçmişe
 * düşmez, weekday=Salı (t1 + alternatif öğretmenin uygun olduğu gün) korunur.
 */
const SERIES_WEEKDAY = 2; // Salı

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

const seriesStartsOn = nextWeekdayAtLeastOneWeekOut(SERIES_WEEKDAY);
const seriesEndsOn = new Date(seriesStartsOn);
seriesEndsOn.setDate(seriesEndsOn.getDate() + 14);

const seriesInput = {
  studentId: "s1",
  teacherId: "t1",
  roomId: "r1",
  branchId: "erzene",
  instrument: "Piyano",
  weekday: SERIES_WEEKDAY,
  // 13:00 — t1 (10-19) VE alternatif t2 (12-20) için AYNI ANDA uygun, erzene şubesinde.
  startTime: "13:00",
  durationMinutes: 40,
  startsOn: ymd(seriesStartsOn),
  endsOn: ymd(seriesEndsOn),
};

async function createTestSeries() {
  const res = await createLessonSeriesTool(ctx(), seriesInput);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("series creation failed");
  return res.data;
}

/** seriesInput'un weekday(2=Salı)/startTime(11:00) diliminde MÜSAİT, Piyano çalan, farklı bir öğretmen bulur. */
async function findAlternatePianoTeacher(excludeTeacherId: string): Promise<string> {
  const data = await readData();
  const alt = data.teachers.find(
    (t) =>
      t.id !== excludeTeacherId &&
      t.active &&
      t.instruments.includes("Piyano") &&
      teacherServesBranch(t, seriesInput.branchId) &&
      t.availability.some(
        (w) => w.dayOfWeek === seriesInput.weekday && w.start <= seriesInput.startTime && w.end > seriesInput.startTime
      )
  );
  if (!alt) throw new Error("no available alternate Piyano teacher in seed data for the test slot");
  return alt.id;
}

describe("changeLessonTeacherOrBranchTool — kapsam (scope)", () => {
  it("'single': yalnızca seçilen ders değişir, seri diğer dersleri etkilenmez", async () => {
    const series = await createTestSeries();
    const altTeacherId = await findAlternatePianoTeacher("t1");
    const firstLessonId = (await readData()).lessons.find((l) => l.seriesId === series.seriesId)!.id;

    const res = await changeLessonTeacherOrBranchTool(ctx(), {
      lessonId: firstLessonId,
      scope: "single",
      newTeacherId: altTeacherId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.affectedLessonIds).toEqual([firstLessonId]);

    const data = await readData();
    const changed = data.lessons.find((l) => l.id === firstLessonId)!;
    expect(changed.teacherId).toBe(altTeacherId);
    const others = data.lessons.filter((l) => l.seriesId === series.seriesId && l.id !== firstLessonId);
    expect(others.every((l) => l.teacherId === "t1")).toBe(true);
    // 'single' kapsamında serinin kendisi DEĞİŞMEZ.
    const seriesRow = data.lessonSeries.find((s) => s.id === series.seriesId)!;
    expect(seriesRow.teacherId).toBe("t1");
  });

  it("'fromHereOnward': seçilen ders VE sonrası değişir, ÖNCEKİ dersler dokunulmaz", async () => {
    const series = await createTestSeries();
    const altTeacherId = await findAlternatePianoTeacher("t1");
    const seriesLessons = (await readData()).lessons
      .filter((l) => l.seriesId === series.seriesId)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    expect(seriesLessons.length).toBe(3);
    const middleLessonId = seriesLessons[1]!.id;

    const res = await changeLessonTeacherOrBranchTool(ctx(), {
      lessonId: middleLessonId,
      scope: "fromHereOnward",
      newTeacherId: altTeacherId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.affectedLessonIds.sort()).toEqual([seriesLessons[1]!.id, seriesLessons[2]!.id].sort());

    const data = await readData();
    expect(data.lessons.find((l) => l.id === seriesLessons[0]!.id)!.teacherId).toBe("t1");
    expect(data.lessons.find((l) => l.id === seriesLessons[1]!.id)!.teacherId).toBe(altTeacherId);
    expect(data.lessons.find((l) => l.id === seriesLessons[2]!.id)!.teacherId).toBe(altTeacherId);
    // 'fromHereOnward'da seri kaydı da güncellenir (raporlama/gelecek referansı için).
    expect(data.lessonSeries.find((s) => s.id === series.seriesId)!.teacherId).toBe(altTeacherId);
  });

  it("'entireSeries': serideki TÜM planlı dersler değişir", async () => {
    const series = await createTestSeries();
    const altTeacherId = await findAlternatePianoTeacher("t1");
    const anyLessonId = (await readData()).lessons.find((l) => l.seriesId === series.seriesId)!.id;

    const res = await changeLessonTeacherOrBranchTool(ctx(), {
      lessonId: anyLessonId,
      scope: "entireSeries",
      newTeacherId: altTeacherId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.affectedLessonIds).toHaveLength(3);

    const data = await readData();
    const all = data.lessons.filter((l) => l.seriesId === series.seriesId);
    expect(all.every((l) => l.teacherId === altTeacherId)).toBe(true);
  });

  it("seriye ait olmayan derste 'fromHereOnward' istenirse NOT_IN_SERIES benzeri hata döner", async () => {
    const before = await readData();
    const standalone = before.lessons.find((l) => !l.seriesId);
    expect(standalone).toBeDefined();
    const altTeacherId = await findAlternatePianoTeacher(standalone!.teacherId);

    const res = await changeLessonTeacherOrBranchTool(ctx(), {
      lessonId: standalone!.id,
      scope: "entireSeries",
      newTeacherId: altTeacherId,
    });
    expect(res.ok).toBe(false);
  });
});

describe("changeLessonTeacherOrBranchTool — çakışma kontrolü", () => {
  it("yeni öğretmen o saatte zaten meşgulse hiçbir değişiklik uygulanmaz (CONFLICT)", async () => {
    const series = await createTestSeries();
    const altTeacherId = await findAlternatePianoTeacher("t1");
    const lessons = (await readData()).lessons.filter((l) => l.seriesId === series.seriesId);
    const target = lessons[0]!;

    // Alternatif öğretmeni TAM O SAATTE başka bir öğrenciyle meşgul et.
    const conflictLesson = await createLessonTool(ctx(), {
      studentId: "s2",
      teacherId: altTeacherId,
      roomId: "r2",
      branchId: "erzene",
      instrument: "Gitar",
      startAt: target.startAt,
      durationMinutes: 40,
    });
    expect(conflictLesson.ok).toBe(true);
    if (!conflictLesson.ok) return;

    const res = await changeLessonTeacherOrBranchTool(ctx(), {
      lessonId: target.id,
      scope: "single",
      newTeacherId: altTeacherId,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("CONFLICT");

    const data = await readData();
    expect(data.lessons.find((l) => l.id === target.id)!.teacherId).toBe("t1");
  });

  it("değişiklik belirtilmezse VALIDATION_ERROR benzeri hata döner", async () => {
    const series = await createTestSeries();
    const lessonId = (await readData()).lessons.find((l) => l.seriesId === series.seriesId)!.id;
    const res = await changeLessonTeacherOrBranchTool(ctx(), { lessonId, scope: "single" });
    expect(res.ok).toBe(false);
  });
});

describe("changeLessonTeacherOrBranchTool — RBAC", () => {
  it("TEACHER rolü ders ataması değiştiremez (FORBIDDEN)", async () => {
    const series = await createTestSeries();
    const lessonId = (await readData()).lessons.find((l) => l.seriesId === series.seriesId)!.id;
    const altTeacherId = await findAlternatePianoTeacher("t1");
    const res = await changeLessonTeacherOrBranchTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      lessonId,
      scope: "single",
      newTeacherId: altTeacherId,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("toplu öğretmen değişikliği — planlı dersleri devret (2026-09-24)", () => {
  it("kutucuk işaretliyse öğrencinin gelecekteki seri dersleri yeni öğretmene taşınır; işaretsizse dersler yerinde kalır", async () => {
    const { bulkStudentActionTool } = await import("../services/tools");
    const series = await createTestSeries();
    const altTeacherId = await findAlternatePianoTeacher("t1");
    // 8. tur (J3) — seed dersleri "bugüne göre" dağıtılır; bazı günlerde s1'in seri DIŞI bir seed
    // dersi yeni öğretmenin müsait olmadığı/dolu olduğu saate düşüp devri (doğru şekilde, hepsi-ya-da-
    // hiçbiri) engelliyordu → tarihe bağlı kırmızı test. Test devri ölçer: s1'in seri dışı ve yeni
    // öğretmenin gelecek seed dersleri iptal edilir; yalnız testin kendi serisi kalır.
    {
      const seeded = await readData();
      const nowIso = new Date().toISOString();
      // Testler STORE_MODE=json ile çalışır: veri dosyası doğrudan güncellenir.
      await fs.writeFile(
        DATA_FILE,
        JSON.stringify({
          ...seeded,
          lessons: seeded.lessons.map((l) =>
            (l.teacherId === altTeacherId || l.studentId === "s1") && l.startAt > nowIso && l.seriesId !== series.seriesId
              ? { ...l, status: "cancelled" }
              : l
          ),
        })
      );
    }
    const before = await readData();
    expect(before.students.find((s) => s.id === "s1")!.teacherId).toBe("t1");

    // İşaretsiz: öğrenci kartı değişir, dersler t1'de kalır.
    const noTransfer = await bulkStudentActionTool(ctx(), { action: "teacher", studentIds: ["s1"], teacherId: altTeacherId });
    expect(noTransfer.ok).toBe(true);
    let data = await readData();
    expect(data.students.find((s) => s.id === "s1")!.teacherId).toBe(altTeacherId);
    expect(data.lessons.filter((l) => l.seriesId === series.seriesId).every((l) => l.teacherId === "t1")).toBe(true);

    // Geri al + bu kez devret: t1'e dönüp tekrar alternatif öğretmene, derslerle birlikte.
    await bulkStudentActionTool(ctx(), { action: "teacher", studentIds: ["s1"], teacherId: "t1" });
    const res = await bulkStudentActionTool(ctx(), {
      action: "teacher",
      studentIds: ["s1"],
      teacherId: altTeacherId,
      transferLessons: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lessonIssues).toEqual([]);
    data = await readData();
    const seriesLessons = data.lessons.filter((l) => l.seriesId === series.seriesId);
    expect(seriesLessons.every((l) => l.teacherId === altTeacherId)).toBe(true);
    // Seri dışı gelecek planlı dersler de dahil: öğrencinin eski öğretmende gelecek dersi kalmaz.
    const futureLeft = data.lessons.filter(
      (l) => l.studentId === "s1" && l.status === "scheduled" && l.teacherId === "t1" && new Date(l.startAt) > new Date()
    );
    expect(futureLeft).toEqual([]);
    expect(res.data.lessonsTransferred).toBeGreaterThanOrEqual(seriesLessons.length);
  });
});
