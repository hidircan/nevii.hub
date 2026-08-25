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

const seriesInput = {
  studentId: "s1",
  teacherId: "t1",
  roomId: "r1",
  branchId: "erzene",
  instrument: "Piyano",
  weekday: 2,
  // 13:00 — t1 (10-19) VE alternatif t2 (12-20) için AYNI ANDA uygun, erzene şubesinde.
  startTime: "13:00",
  durationMinutes: 40,
  startsOn: "2026-09-01",
  endsOn: "2026-09-15",
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
