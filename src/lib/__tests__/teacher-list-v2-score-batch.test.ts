import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { computeTeacherPerformanceReportV2 } from "../teacher-performance-v2";
import { TEACHER_FEEDBACK_FILE_PATH } from "../teacher-feedback";
import { TASKS_FILE } from "../tasks";
import { HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import type { Lesson } from "../types";

/**
 * Öğretmenler listesi (src/app/panel/ogretmenler/page.tsx) artık eski
 * computeTeacherPerformanceScore yerine, tüm görünür öğretmenler için
 * `Promise.all` ile PARALEL computeTeacherPerformanceReportV2 çağırıyor —
 * bu test o kullanım biçimini (birden çok öğretmen, aynı `data`, aynı anda)
 * doğrular: her öğretmen kendi skorunu/versiyonunu alır, çapraz bulaşma olmaz.
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TEACHER_FEEDBACK_FILE_PATH, { force: true });
  await fs.rm(TASKS_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
});

function lesson(overrides: Partial<Lesson> & Pick<Lesson, "id" | "startAt" | "teacherId">): Lesson {
  return {
    studentId: "s1",
    roomId: "r1",
    branchId: "erzene" as Lesson["branchId"],
    instrument: "Piyano",
    endAt: overrides.startAt,
    type: "regular",
    status: "completed",
    ...overrides,
  };
}

const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-01-31";

describe("Öğretmen listesi — batch v2 skor hesabı (Promise.all)", () => {
  it("her öğretmen kendi 'teacher-performance-v2' raporunu ve skorunu alır, karışmaz", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "batch-l1", teacherId: "t1", startAt: "2026-01-05T10:00:00.000Z", teacherAttendanceStatus: "geldi" }),
      lesson({ id: "batch-l2", teacherId: "t2", startAt: "2026-01-06T10:00:00.000Z", teacherAttendanceStatus: "gelmedi" }),
    ];
    const data = { ...base, lessons };

    const [reportT1, reportT2] = await Promise.all([
      computeTeacherPerformanceReportV2(data, DEFAULT_TENANT_ID, "t1", PERIOD_START, PERIOD_END),
      computeTeacherPerformanceReportV2(data, DEFAULT_TENANT_ID, "t2", PERIOD_START, PERIOD_END),
    ]);

    expect(reportT1.version).toBe("teacher-performance-v2");
    expect(reportT2.version).toBe("teacher-performance-v2");
    expect(reportT1.teacherId).toBe("t1");
    expect(reportT2.teacherId).toBe("t2");
    expect(reportT1.components.attendance.attendedCount).toBe(1);
    expect(reportT1.components.attendance.absentCount).toBe(0);
    expect(reportT2.components.attendance.attendedCount).toBe(0);
    expect(reportT2.components.attendance.absentCount).toBe(1);
  });

  it("bir öğretmenin verisi yoksa (Yetersiz veri) diğerinin skorunu etkilemez", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "batch-l3", teacherId: "t3", startAt: "2026-01-05T10:00:00.000Z", teacherAttendanceStatus: "geldi" }),
    ];
    const data = { ...base, lessons };

    const [reportT3, reportT4] = await Promise.all([
      computeTeacherPerformanceReportV2(data, DEFAULT_TENANT_ID, "t3", PERIOD_START, PERIOD_END),
      computeTeacherPerformanceReportV2(data, DEFAULT_TENANT_ID, "t4", PERIOD_START, PERIOD_END),
    ]);

    expect(reportT3.components.attendance.hasData).toBe(true);
    expect(reportT4.score).toBeNull();
  });
});
