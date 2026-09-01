import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  addLessonSeries,
  cancelLessonSeriesFromLesson,
  cancelEntireLessonSeries,
  readData,
} from "../store";
import type { SeriesParams } from "../lesson-series";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

/**
 * Kök neden düzeltmesi — startsOn/endsOn eskiden sabit "2026-09-01"/"2026-09-15"
 * literal tarihleriydi (bkz. lesson-reassignment.test.ts / lesson-series-tools.test.ts'deki
 * AYNI sınıf düzeltme). Takvim bu tarihe ulaştığında serinin ilk oluşumu
 * geçmişe düşer, validateLessonSlot PAST_START ile reddeder ve addLessonSeries
 * skipConflicts vermediğinden TÜM seri engellenir. Ürün davranışı doğru;
 * düzeltme testin HER ZAMAN bugünden en az bir hafta sonraki bir Salı'dan
 * başlamasını sağlamakta.
 */
const BASE_PARAMS_WEEKDAY = 2; // Salı

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

const baseParamsStartsOn = nextWeekdayAtLeastOneWeekOut(BASE_PARAMS_WEEKDAY);
const baseParamsEndsOn = new Date(baseParamsStartsOn);
baseParamsEndsOn.setDate(baseParamsEndsOn.getDate() + 14);

const baseParams: SeriesParams = {
  studentId: "s1",
  teacherId: "t1",
  roomId: "r1",
  branchId: "erzene",
  instrument: "Piyano",
  weekday: BASE_PARAMS_WEEKDAY,
  startTime: "11:00",
  durationMinutes: 45,
  startsOn: ymd(baseParamsStartsOn),
  endsOn: ymd(baseParamsEndsOn),
};

describe("addLessonSeries (store)", () => {
  it("çakışma yoksa seriyi ve tüm dersleri atomik olarak yazar", async () => {
    const result = await addLessonSeries(baseParams);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdLessonIds).toHaveLength(3);

    const data = await readData();
    expect(data.lessonSeries.some((s) => s.id === result.seriesId)).toBe(true);
    for (const id of result.createdLessonIds) {
      expect(data.lessons.some((l) => l.id === id && l.seriesId === result.seriesId)).toBe(true);
    }
  });

  it("var olmayan öğretmen id'si reddedilir, hiçbir şey yazılmaz", async () => {
    const before = await readData();
    await expect(addLessonSeries({ ...baseParams, teacherId: "does-not-exist" })).rejects.toThrow();
    const after = await readData();
    expect(after.lessonSeries.length).toBe(before.lessonSeries.length);
    expect(after.lessons.length).toBe(before.lessons.length);
  });

  it("tenant dışı/bulunamayan şube reddedilir", async () => {
    await expect(addLessonSeries({ ...baseParams, branchId: "does-not-exist" })).rejects.toThrow();
  });
});

describe("cancelLessonSeriesFromLesson (store)", () => {
  it("bu ders ve sonrasını iptal eder, önceki dersleri korur", async () => {
    const created = await addLessonSeries(baseParams);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const secondLessonId = created.createdLessonIds[1];
    const result = await cancelLessonSeriesFromLesson(secondLessonId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = await readData();
    const first = data.lessons.find((l) => l.id === created.createdLessonIds[0])!;
    const second = data.lessons.find((l) => l.id === secondLessonId)!;
    expect(first.status).toBe("scheduled");
    expect(second.status).toBe("cancelled");

    const series = data.lessonSeries.find((s) => s.id === created.seriesId)!;
    expect(series.status).toBe("ended");
  });
});

describe("cancelEntireLessonSeries (store)", () => {
  it("tüm seriyi iptal eder", async () => {
    const created = await addLessonSeries(baseParams);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await cancelEntireLessonSeries(created.seriesId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = await readData();
    const series = data.lessonSeries.find((s) => s.id === created.seriesId)!;
    expect(series.status).toBe("cancelled");
    for (const id of created.createdLessonIds) {
      expect(data.lessons.find((l) => l.id === id)!.status).toBe("cancelled");
    }
  });
});
