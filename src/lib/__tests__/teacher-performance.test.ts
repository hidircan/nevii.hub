import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { computeTeacherPerformanceReport } from "../teacher-performance";
import { getTeacherPerformanceReportTool } from "../services/tools";
import { submitTeacherFeedback, TEACHER_FEEDBACK_FILE_PATH } from "../teacher-feedback";
import type { Lesson } from "../types";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TEACHER_FEEDBACK_FILE_PATH, { force: true });
});

function lesson(overrides: Partial<Lesson> & Pick<Lesson, "id" | "startAt">): Lesson {
  return {
    studentId: "s1",
    teacherId: "t1",
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

describe("computeTeacherPerformanceReport — Faz 2 kuralı: öğrenci yoklaması skora GİRMEZ", () => {
  it("öğrenci yoklaması farklı olsa bile, öğretmen kaynaklı aksamalar aynıysa skor AYNIDIR", async () => {
    const base = await readData();
    const teacherCancel = { status: "cancelled" as const, disruptionSource: "teacher" as const };

    const lessonsWithStudentPresent: Lesson[] = [
      lesson({ id: "perf-l1", startAt: "2026-01-05T10:00:00.000Z", studentAttended: true }),
      lesson({ id: "perf-l2", startAt: "2026-01-06T10:00:00.000Z", studentAttended: true }),
      lesson({ id: "perf-l3", startAt: "2026-01-07T10:00:00.000Z", ...teacherCancel }),
    ];
    const lessonsWithStudentAbsent: Lesson[] = [
      lesson({ id: "perf-l1", startAt: "2026-01-05T10:00:00.000Z", studentAbsent: true }),
      lesson({ id: "perf-l2", startAt: "2026-01-06T10:00:00.000Z", studentAbsent: true }),
      lesson({ id: "perf-l3", startAt: "2026-01-07T10:00:00.000Z", ...teacherCancel }),
    ];

    const reportA = await computeTeacherPerformanceReport(
      { ...base, lessons: lessonsWithStudentPresent },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    const reportB = await computeTeacherPerformanceReport(
      { ...base, lessons: lessonsWithStudentAbsent },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );

    expect(reportA.attendanceRate).toBe(reportB.attendanceRate);
    expect(reportA.score).toBe(reportB.score);
    expect(reportA.plannedLessonCount).toBe(3);
    expect(reportA.teacherCausedCount).toBe(1);
  });

  it("yalnız 'Öğretmen kaynaklı' iptal/telafi sayılır; kurum/öğrenci/belirtilmemiş kaynak nötrdür", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "perf-l4", startAt: "2026-01-10T10:00:00.000Z" }),
      lesson({ id: "perf-l5", startAt: "2026-01-11T10:00:00.000Z", opsMakeupFlag: true, disruptionSource: "teacher" }),
      lesson({ id: "perf-l5b", startAt: "2026-01-12T10:00:00.000Z", status: "cancelled", disruptionSource: "institution" }),
      lesson({ id: "perf-l5c", startAt: "2026-01-13T10:00:00.000Z", opsMakeupFlag: true }),
    ];
    const report = await computeTeacherPerformanceReport(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.plannedLessonCount).toBe(2);
    expect(report.teacherCausedCount).toBe(1);
    expect(report.attendanceRate).toBe(0.5);
  });
});

describe("computeTeacherPerformanceReport — veri yokken güvenli davranış", () => {
  it("dönemde hiç ders yoksa attendanceRate null, score null", async () => {
    const base = await readData();
    const report = await computeTeacherPerformanceReport(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.plannedLessonCount).toBe(0);
    expect(report.attendanceRate).toBeNull();
    expect(report.feedbackAverage).toBeNull();
    expect(report.score).toBeNull();
  });

  it("aksamasız gerçekleşmiş derslerde güvenilirlik %100", async () => {
    const base = await readData();
    const lessons: Lesson[] = [lesson({ id: "perf-l6", startAt: "2026-01-12T10:00:00.000Z" })];
    const report = await computeTeacherPerformanceReport(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.plannedLessonCount).toBe(1);
    expect(report.teacherCausedCount).toBe(0);
    expect(report.attendanceRate).toBe(1);
  });
});

describe("computeTeacherPerformanceReport — geri bildirim bileşeni", () => {
  it("eşik altı (< 3) geri bildirim varsa feedbackAverage null kalır (anonimlik eşiği)", async () => {
    const base = await readData();
    await submitTeacherFeedback({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      submittedBy: "s1",
      submitterRole: "STUDENT",
      scores: { clarity: 5, communication: 5, effectiveness: 5, motivation: 5, punctuality: 5 },
    });
    const report = await computeTeacherPerformanceReport(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.feedbackAverage).toBeNull();
  });

  it("eşik üstü (>= 3) geri bildirim varsa feedbackAverage hesaplanır ve skora girer", async () => {
    const base = await readData();
    for (const studentId of ["s1", "s2", "s3"]) {
      await submitTeacherFeedback({
        tenantId: DEFAULT_TENANT_ID,
        teacherId: "t1",
        studentId,
        submittedBy: studentId,
        submitterRole: "STUDENT",
        scores: { clarity: 5, communication: 5, effectiveness: 5, motivation: 5, punctuality: 5 },
      });
    }
    const report = await computeTeacherPerformanceReport(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.feedbackAverage).toBe(5);
    expect(report.feedbackCount).toBe(3);
    // Yalnız feedback verisi varken (katılım verisi yok) skor 1-5 → 0-100 ölçeğine taşınır: (5-1)/4*100=100.
    expect(report.score).toBe(100);
  });

  it("hem katılım hem geri bildirim varsa skor ağırlıklı toplamdır (%60 + %40)", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "perf-l7", startAt: "2026-01-15T10:00:00.000Z" }),
    ];
    for (const studentId of ["s1", "s2", "s3"]) {
      await submitTeacherFeedback({
        tenantId: DEFAULT_TENANT_ID,
        teacherId: "t1",
        studentId,
        submittedBy: studentId,
        submitterRole: "STUDENT",
        scores: { clarity: 5, communication: 5, effectiveness: 5, motivation: 5, punctuality: 5 },
      });
    }
    const report = await computeTeacherPerformanceReport(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    // Katılım %100 * 60 + feedback (5→100) * 40 = 60 + 40 = 100.
    expect(report.score).toBe(100);
  });
});

describe("getTeacherPerformanceReportTool — RBAC + görünürlük", () => {
  it("öğretmen yalnızca kendi raporunu görebilir", async () => {
    const own = await getTeacherPerformanceReportTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      teacherId: "t1",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(own.ok).toBe(true);

    const other = await getTeacherPerformanceReportTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      teacherId: "t2",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN herhangi bir öğretmenin raporunu görebilir", async () => {
    const res = await getTeacherPerformanceReportTool(ctx(), {
      teacherId: "t1",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(res.ok).toBe(true);
  });
});
