import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { computeTeacherPerformanceReportV2 } from "../teacher-performance-v2";
import { getTeacherPerformanceReportV2Tool } from "../services/tools";
import { submitTeacherFeedback, TEACHER_FEEDBACK_FILE_PATH } from "../teacher-feedback";
import { createTask, updateTask, TASKS_FILE } from "../tasks";
import { createHomework, submitHomework, HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import type { Lesson } from "../types";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TEACHER_FEEDBACK_FILE_PATH, { force: true });
  await fs.rm(TASKS_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
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

describe("computeTeacherPerformanceReportV2 — öğrenci yoklaması skora GİRMEZ", () => {
  it("öğrenci yoklaması farklı olsa bile ders güvenilirliği bileşeni aynıdır", async () => {
    const base = await readData();
    const withPresent: Lesson[] = [
      lesson({ id: "v2-l1", startAt: "2026-01-05T10:00:00.000Z", lessonProcessed: true, studentAttended: true }),
      lesson({ id: "v2-l2", startAt: "2026-01-06T10:00:00.000Z", studentAttended: true, status: "cancelled", disruptionSource: "teacher" }),
    ];
    const withAbsent: Lesson[] = [
      lesson({ id: "v2-l1", startAt: "2026-01-05T10:00:00.000Z", lessonProcessed: true, studentAbsent: true }),
      lesson({ id: "v2-l2", startAt: "2026-01-06T10:00:00.000Z", studentExcused: true, status: "cancelled", disruptionSource: "teacher" }),
    ];

    const reportA = await computeTeacherPerformanceReportV2(
      { ...base, lessons: withPresent },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    const reportB = await computeTeacherPerformanceReportV2(
      { ...base, lessons: withAbsent },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );

    expect(reportA.components.attendance.rawValue).toBe(reportB.components.attendance.rawValue);
    expect(reportA.components.attendance.plannedLessonCount).toBe(2);
    expect(reportA.components.attendance.teacherCausedCount).toBe(1);
  });
});

describe("computeTeacherPerformanceReportV2 — veri yokken güvenli davranış", () => {
  it("tüm bileşenler verisizse skor null (Yetersiz veri)", async () => {
    const base = await readData();
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.score).toBeNull();
    expect(report.components.attendance.hasData).toBe(false);
    expect(report.components.feedback.hasData).toBe(false);
    expect(report.components.tasks.hasData).toBe(false);
    expect(report.components.homework.hasData).toBe(false);
  });

  it("yalnızca yoklama+ödev verisi varsa (görev/geri bildirim yok), ağırlıklar bu ikisine yeniden normalize edilir", async () => {
    const base = await readData();
    // Geçmiş, iptal edilmemiş, "İşlendi" ders → hem yoklama hem ödev-uygunluk bileşenini besler
    // (ödev verilmediği için ödev bileşeni 0 katkı yapar, ama "veri yok" SAYILMAZ — bkz. ayrı homework testleri).
    const lessons: Lesson[] = [
      lesson({ id: "v2-l3", startAt: "2026-01-10T10:00:00.000Z", lessonProcessed: true }),
    ];
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    // Varsayılan ağırlıklar (performance-weights.ts) yoklama 28, ödev 24 → 100 * 28/52 ≈ 53.8
    expect(report.components.attendance.contribution).toBeCloseTo(53.8, 1);
    expect(report.components.homework.hasData).toBe(true);
    expect(report.components.homework.contribution).toBe(0);
    expect(report.score).toBe(54);
  });
});

describe("computeTeacherPerformanceReportV2 — iş takip", () => {
  it("görev yoksa bileşen 'veri yok' sayılır, skor haksız düşmez", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "v2-l4", startAt: "2026-01-10T10:00:00.000Z", lessonProcessed: true }),
    ];
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.components.tasks.hasData).toBe(false);
    // Görev verisi yok → iş takip ağırlığı diğer mevcut bileşenlere (yoklama+ödev) yeniden dağılır.
    expect(report.score).toBe(54);
  });

  it("son tarihi geçmiş, tamamlanmamış görev gecikmiş sayılır ve zamanında tamamlama oranını düşürür", async () => {
    const base = await readData();
    await createTask({
      tenantId: DEFAULT_TENANT_ID,
      title: "Rapor teslimi",
      priority: "MEDIUM",
      category: "Program",
      assigneeId: "t1",
      createdById: "admin1",
      dueDate: "2026-01-05",
    });
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.components.tasks.totalAssigned).toBe(1);
    expect(report.components.tasks.overdueCount).toBe(1);
    expect(report.components.tasks.onTimeRate).toBe(0);
  });

  it("zamanında tamamlanan görev tam skor katkısı verir", async () => {
    const base = await readData();
    const created = await createTask({
      tenantId: DEFAULT_TENANT_ID,
      title: "Rapor teslimi",
      priority: "MEDIUM",
      category: "Program",
      assigneeId: "t1",
      createdById: "admin1",
      dueDate: "2026-01-20",
    });
    await updateTask(DEFAULT_TENANT_ID, created.id, { status: "COMPLETED", completedAt: "2026-01-15T10:00:00.000Z" });
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.components.tasks.onTimeCount).toBe(1);
    expect(report.components.tasks.onTimeRate).toBe(1);
  });
});

describe("computeTeacherPerformanceReportV2 — ödev disiplini", () => {
  it("gelecekteki ve iptal edilen dersler ödev bileşenine katılmaz", async () => {
    const base = await readData();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const lessons: Lesson[] = [
      lesson({ id: "v2-future", startAt: future, lessonProcessed: true }),
      lesson({ id: "v2-cancelled", startAt: "2026-01-10T10:00:00.000Z", status: "cancelled", lessonProcessed: true }),
    ];
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      "2020-01-01",
      "2027-01-01"
    );
    expect(report.components.homework.eligibleLessonCount).toBe(0);
    expect(report.components.homework.hasData).toBe(false);
  });

  it("uygun ders var ama ödev verilmemişse notAssignedCount artar ve oran düşer; ödev/görev verisi olmaması skoru haksız düşürmez", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "v2-l5", startAt: "2026-01-10T10:00:00.000Z", lessonProcessed: true }),
      lesson({ id: "v2-l6", startAt: "2026-01-11T10:00:00.000Z", lessonProcessed: true }),
    ];
    await createHomework({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      lessonId: "v2-l5",
      title: "Gam çalışması",
      description: "Do majör gam",
      dueDate: "2026-01-15",
    });
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.components.homework.eligibleLessonCount).toBe(2);
    expect(report.components.homework.assignedCount).toBe(1);
    expect(report.components.homework.notAssignedCount).toBe(1);
    expect(report.components.homework.rawValue).toBe(0.5);
  });

  it("öğrencinin ödevi teslim etmesi/incelenmesi doğru sayılır", async () => {
    const base = await readData();
    const lessons: Lesson[] = [
      lesson({ id: "v2-l7", startAt: "2026-01-10T10:00:00.000Z", lessonProcessed: true }),
    ];
    const hw = await createHomework({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      lessonId: "v2-l7",
      title: "Gam çalışması",
      description: "Do majör gam",
      dueDate: "2026-01-15",
    });
    await submitHomework({ tenantId: DEFAULT_TENANT_ID, homeworkId: hw.id, studentId: "s1" });
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.components.homework.submittedCount).toBe(1);
    expect(report.components.homework.reviewedCount).toBe(0);
  });
});

describe("computeTeacherPerformanceReportV2 — geri bildirim anonimlik eşiği", () => {
  it("eşik altı yanıt varsa detay/ortalama gösterilmez", async () => {
    const base = await readData();
    await submitTeacherFeedback({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      submittedBy: "s1",
      submitterRole: "STUDENT",
      scores: { clarity: 5, communication: 5, effectiveness: 5, motivation: 5, punctuality: 5 },
    });
    const report = await computeTeacherPerformanceReportV2(
      { ...base, lessons: [] },
      DEFAULT_TENANT_ID,
      "t1",
      PERIOD_START,
      PERIOD_END
    );
    expect(report.components.feedback.eligible).toBe(false);
    expect(report.components.feedback.hasData).toBe(false);
  });
});

describe("getTeacherPerformanceReportV2Tool — RBAC + görünürlük", () => {
  it("öğretmen yalnızca kendi raporunu görebilir", async () => {
    const own = await getTeacherPerformanceReportV2Tool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      teacherId: "t1",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(own.ok).toBe(true);

    const other = await getTeacherPerformanceReportV2Tool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      teacherId: "t2",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN herhangi bir öğretmenin raporunu görebilir", async () => {
    const res = await getTeacherPerformanceReportV2Tool(ctx(), {
      teacherId: "t1",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(res.ok).toBe(true);
  });

  it("öğretmen bulunamazsa NOT_FOUND döner", async () => {
    const res = await getTeacherPerformanceReportV2Tool(ctx(), {
      teacherId: "yok",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});
