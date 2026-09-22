/**
 * Teacher performance v2 — genişletilmiş 4 bileşenli rapor. v1
 * (`src/lib/teacher-performance.ts`, `teacher-performance-v1`) BOZULMAZ; bu
 * ayrı bir modül ve ayrı bir versiyon string'idir (`teacher-performance-v2`).
 *
 * KURAL (v1'den miras, kesinlikle bozulmaz): hiçbir bileşen öğrenci
 * yoklamasına (`studentAttended`/`studentAbsent`/`studentExcused`) bakarak
 * öğretmeni cezalandırmaz/ödüllendirmez. "İşlendi" (`lessonProcessed`)
 * yalnızca "bu ders kurumca tamamlanmış kabul edildi" anlamında, ödev
 * bileşeninin aday-ders seçiminde kullanılır — öğrenci katılımı değil.
 *
 * Ağırlıklar: yoklama %30, geri bildirim %25, iş takip %20, ödev %25. Bir
 * bileşen için dönemde veri yoksa (`value === null`) o bileşen ağırlığı
 * SIFIR sayılmaz — kalan mevcut bileşenlerin ağırlıkları toplam 1'e gelecek
 * şekilde yeniden normalize edilir (bkz. `combineComponents`). Tüm bileşenler
 * verisizse toplam skor `null` ("Yetersiz veri").
 */
import type { AppData, Homework, HomeworkSubmission, Lesson } from "./types";
import { OPEN_TASK_STATUSES } from "./types";
import { computeTeacherFeedbackSummary, type TeacherFeedbackSummary } from "./teacher-feedback";
import { listTasks } from "./tasks";
import { listHomeworkForTeacher, listAllHomeworkSubmissions } from "./homework";
import { effectiveLessonOpsStatus } from "./lesson-ops";

export const TEACHER_PERFORMANCE_V2_SCORE_VERSION = "teacher-performance-v2";

export const TEACHER_PERFORMANCE_V2_WEIGHTS = {
  attendance: 0.3,
  feedback: 0.25,
  tasks: 0.2,
  homework: 0.25,
} as const;

export type PerformanceComponentV2 = {
  weight: number;
  /** Bu dönemde bu bileşen için yeterli veri var mı (false ⇒ tüm alanlar null, "veri yok"). */
  hasData: boolean;
  /** Bileşenin ham oranı/ortalaması (bileşene özgü ölçek — ör. 0–1 oran ya da 1–5 ortalama). */
  rawValue: number | null;
  /** 0–100'e normalize edilmiş değer. */
  normalizedValue: number | null;
  /** Toplam skora katkısı (0–100 ölçeğinde, yeniden-normalize edilmiş ağırlıkla). null ⇒ hasData:false. */
  contribution: number | null;
};

export type AttendanceDetailRow = {
  lessonId: string;
  startAt: string;
  endAt: string;
  studentId: string;
  studentName: string;
  instrument: string;
  status: "geldi" | "gelmedi" | "mazeretli" | "bekliyor";
  markedAt?: string;
  markedBy?: string;
  note?: string;
};

export type TaskDetailRow = {
  taskId: string;
  title: string;
  category: string;
  priority: string;
  createdAt: string;
  dueDate?: string;
  status: string;
  completedAt?: string;
  overdue: boolean;
};

export type HomeworkDetailRow = {
  lessonId: string;
  startAt: string;
  studentId: string;
  studentName: string;
  instrument: string;
  homeworkGiven: boolean;
  homeworkTitle?: string;
  homeworkDueDate?: string;
  studentSubmitted: boolean;
  teacherReviewed: boolean;
};

export type TeacherPerformanceReportV2 = {
  version: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  components: {
    attendance: PerformanceComponentV2 & {
      plannedLessonCount: number;
      attendedCount: number;
      absentCount: number;
      excusedCount: number;
      pendingCount: number;
      rows: AttendanceDetailRow[];
    };
    feedback: PerformanceComponentV2 & {
      responseCount: number;
      eligible: boolean;
      criteriaAverages: TeacherFeedbackSummary["criteriaAverages"];
      sharedComments: string[];
    };
    tasks: PerformanceComponentV2 & {
      totalAssigned: number;
      completedCount: number;
      openCount: number;
      overdueCount: number;
      onTimeCount: number;
      completionRate: number | null;
      onTimeRate: number | null;
      rows: TaskDetailRow[];
    };
    homework: PerformanceComponentV2 & {
      eligibleLessonCount: number;
      assignedCount: number;
      notAssignedCount: number;
      submittedCount: number;
      reviewedCount: number;
      rows: HomeworkDetailRow[];
    };
    /** Dönemde bu öğretmene bağlanan yeni öğrenci kayıtları. Veri yoksa skordan düşer. */
    enrollmentFromSchedule: PerformanceComponentV2 & { registrationCount: number };
  };
};

function inRange(iso: string, start: number, end: number): boolean {
  const t = new Date(iso).getTime();
  return t >= start && t <= end;
}

function computeAttendanceComponent(
  data: AppData,
  teacherId: string,
  rangeStart: number,
  rangeEnd: number
): TeacherPerformanceReportV2["components"]["attendance"] {
  const lessons = data.lessons.filter(
    (l) => l.teacherId === teacherId && l.status !== "cancelled" && inRange(l.startAt, rangeStart, rangeEnd)
  );

  const attendedCount = lessons.filter((l) => l.teacherAttendanceStatus === "geldi").length;
  const absentCount = lessons.filter((l) => l.teacherAttendanceStatus === "gelmedi").length;
  const excusedCount = lessons.filter((l) => l.teacherAttendanceStatus === "mazeretli").length;
  const markedCount = attendedCount + absentCount + excusedCount;
  const pendingCount = lessons.length - markedCount;
  const attendanceRate = markedCount > 0 ? attendedCount / markedCount : null;

  const rows: AttendanceDetailRow[] = lessons
    .slice()
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((l) => {
      const student = data.students.find((s) => s.id === l.studentId);
      return {
        lessonId: l.id,
        startAt: l.startAt,
        endAt: l.endAt,
        studentId: l.studentId,
        studentName: student?.name ?? "—",
        instrument: l.instrument,
        status: l.teacherAttendanceStatus ?? "bekliyor",
        markedAt: l.teacherAttendanceAt,
        markedBy: l.teacherAttendanceBy,
        note: l.teacherAttendanceNote,
      };
    });

  const normalizedValue = attendanceRate !== null ? attendanceRate * 100 : null;
  return {
    weight: TEACHER_PERFORMANCE_V2_WEIGHTS.attendance,
    hasData: attendanceRate !== null,
    rawValue: attendanceRate,
    normalizedValue,
    contribution: null, // combineComponents() doldurur
    plannedLessonCount: lessons.length,
    attendedCount,
    absentCount,
    excusedCount,
    pendingCount,
    rows,
  };
}

async function computeFeedbackComponent(
  tenantId: string,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): Promise<TeacherPerformanceReportV2["components"]["feedback"]> {
  const summary = await computeTeacherFeedbackSummary(tenantId, teacherId, periodStart, periodEnd);
  const average =
    summary.eligible && summary.criteriaAverages
      ? Object.values(summary.criteriaAverages).reduce((s, v) => s + v, 0) /
        Object.values(summary.criteriaAverages).length
      : null;
  // 1–5 ölçeği 0–100'e taşınır (v1 ile aynı dönüşüm).
  const normalizedValue = average !== null ? ((average - 1) / 4) * 100 : null;

  return {
    weight: TEACHER_PERFORMANCE_V2_WEIGHTS.feedback,
    hasData: average !== null,
    rawValue: average !== null ? Math.round(average * 10) / 10 : null,
    normalizedValue,
    contribution: null,
    responseCount: summary.responseCount,
    eligible: summary.eligible,
    criteriaAverages: summary.criteriaAverages,
    sharedComments: summary.sharedComments,
  };
}

const OVERDUE_TODAY = () => new Date().toISOString().slice(0, 10);

async function computeTasksComponent(
  tenantId: string,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): Promise<TeacherPerformanceReportV2["components"]["tasks"]> {
  const allAssigned = await listTasks(tenantId, { assigneeId: teacherId });
  // Dönem kapsamı: son tarihi dönem içinde olan görevler, son tarihi olmayanlar için oluşturulma tarihi baz alınır.
  const candidates = allAssigned.filter((t) =>
    t.dueDate ? t.dueDate.slice(0, 10) >= periodStart && t.dueDate.slice(0, 10) <= periodEnd : t.createdAt.slice(0, 10) >= periodStart && t.createdAt.slice(0, 10) <= periodEnd
  );

  const today = OVERDUE_TODAY();
  const completed = candidates.filter((t) => t.status === "COMPLETED");
  const open = candidates.filter((t) => (OPEN_TASK_STATUSES).includes(t.status));
  const overdue = open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today);
  const withDueDate = candidates.filter((t) => t.dueDate);
  const onTime = withDueDate.filter(
    (t) => t.status === "COMPLETED" && t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate!.slice(0, 10)
  );

  const completionRate = candidates.length > 0 ? completed.length / candidates.length : null;
  const onTimeRate = withDueDate.length > 0 ? onTime.length / withDueDate.length : null;
  // Öncelik: zamanında tamamlama oranı (due date'i olan görevler varsa); yoksa tamamlanma oranı.
  const normalizedValue = onTimeRate !== null ? onTimeRate * 100 : completionRate !== null ? completionRate * 100 : null;

  const rows: TaskDetailRow[] = candidates
    .slice()
    .sort((a, b) => (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt))
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      createdAt: t.createdAt,
      dueDate: t.dueDate,
      status: t.status,
      completedAt: t.completedAt,
      overdue: !!(t.dueDate && (OPEN_TASK_STATUSES).includes(t.status) && t.dueDate.slice(0, 10) < today),
    }));

  return {
    weight: TEACHER_PERFORMANCE_V2_WEIGHTS.tasks,
    hasData: candidates.length > 0,
    rawValue: onTimeRate ?? completionRate,
    normalizedValue,
    contribution: null,
    totalAssigned: candidates.length,
    completedCount: completed.length,
    openCount: open.length,
    overdueCount: overdue.length,
    onTimeCount: onTime.length,
    completionRate,
    onTimeRate,
    rows,
  };
}

/** Ödev bileşeni için "uygun ders" — iptal edilmemiş, geçmişte kalmış, geldi/işlendi kabul edilmiş. */
function isEligibleLessonForHomework(lesson: Lesson, nowMs: number): boolean {
  if (lesson.status === "cancelled") return false;
  if (new Date(lesson.startAt).getTime() >= nowMs) return false;
  const processed = effectiveLessonOpsStatus(lesson) === "processed";
  return lesson.teacherAttendanceStatus === "geldi" || processed;
}

async function computeHomeworkComponent(
  data: AppData,
  tenantId: string,
  teacherId: string,
  rangeStart: number,
  rangeEnd: number
): Promise<TeacherPerformanceReportV2["components"]["homework"]> {
  const nowMs = Date.now();
  const eligibleLessons = data.lessons.filter(
    (l) => l.teacherId === teacherId && inRange(l.startAt, rangeStart, rangeEnd) && isEligibleLessonForHomework(l, nowMs)
  );

  const homework = await listHomeworkForTeacher(tenantId, teacherId);
  const homeworkByLessonId = new Map<string, Homework>();
  for (const h of homework) {
    if (h.lessonId) homeworkByLessonId.set(h.lessonId, h);
  }

  const allSubmissions = await listAllHomeworkSubmissions(tenantId);
  const submissionsByHomeworkId = new Map<string, HomeworkSubmission[]>();
  for (const s of allSubmissions) {
    const list = submissionsByHomeworkId.get(s.homeworkId) ?? [];
    list.push(s);
    submissionsByHomeworkId.set(s.homeworkId, list);
  }

  const rows: HomeworkDetailRow[] = eligibleLessons
    .slice()
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((l) => {
      const student = data.students.find((s) => s.id === l.studentId);
      const hw = homeworkByLessonId.get(l.id);
      const submissions = hw ? submissionsByHomeworkId.get(hw.id) ?? [] : [];
      return {
        lessonId: l.id,
        startAt: l.startAt,
        studentId: l.studentId,
        studentName: student?.name ?? "—",
        instrument: l.instrument,
        homeworkGiven: !!hw,
        homeworkTitle: hw?.title,
        homeworkDueDate: hw?.dueDate,
        studentSubmitted: submissions.length > 0,
        teacherReviewed: submissions.some((s) => !!s.reviewedAt),
      };
    });

  const assignedCount = rows.filter((r) => r.homeworkGiven).length;
  const notAssignedCount = rows.length - assignedCount;
  const submittedCount = rows.filter((r) => r.studentSubmitted).length;
  const reviewedCount = rows.filter((r) => r.teacherReviewed).length;
  const rate = rows.length > 0 ? assignedCount / rows.length : null;

  return {
    weight: TEACHER_PERFORMANCE_V2_WEIGHTS.homework,
    hasData: rows.length > 0,
    rawValue: rate,
    normalizedValue: rate !== null ? rate * 100 : null,
    contribution: null,
    eligibleLessonCount: rows.length,
    assignedCount,
    notAssignedCount,
    submittedCount,
    reviewedCount,
    rows,
  };
}

/** Mevcut bileşenlerin ağırlıklarını 1'e yeniden normalize edip katkıları doldurur. Hiçbiri yoksa toplam skor null. Ağırlığı 0 olan metrik pasiftir. */
function combineComponents(
  components: Record<string, PerformanceComponentV2>,
  weights: Record<string, number>
): number | null {
  for (const k of Object.keys(components)) components[k]!.weight = (weights[k] ?? 0) / 100;
  const present = Object.keys(components).filter((k) => components[k]?.hasData && (weights[k] ?? 0) > 0);
  if (present.length === 0) return null;

  const totalWeight = present.reduce((s, k) => s + (weights[k] ?? 0), 0);
  let score = 0;
  for (const k of present) {
    const effectiveWeight = (weights[k] ?? 0) / totalWeight;
    const contribution = (components[k]!.normalizedValue ?? 0) * effectiveWeight;
    components[k]!.contribution = Math.round(contribution * 10) / 10;
    score += contribution;
  }
  return Math.round(score);
}

export async function computeTeacherPerformanceReportV2(
  data: AppData,
  tenantId: string,
  teacherId: string,
  periodStart: string,
  periodEnd: string
): Promise<TeacherPerformanceReportV2> {
  const rangeStart = new Date(periodStart).getTime();
  const rangeEnd = new Date(periodEnd).getTime();

  const attendance = computeAttendanceComponent(data, teacherId, rangeStart, rangeEnd);
  const feedback = await computeFeedbackComponent(tenantId, teacherId, periodStart, periodEnd);
  const tasks = await computeTasksComponent(tenantId, teacherId, periodStart, periodEnd);
  const homework = await computeHomeworkComponent(data, tenantId, teacherId, rangeStart, rangeEnd);
  const registrationCount = data.students.filter((s) => {
    if (s.teacherId !== teacherId) return false;
    const created = new Date(s.createdAt).getTime();
    return created >= rangeStart && created <= rangeEnd;
  }).length;
  const enrollmentFromSchedule: PerformanceComponentV2 & { registrationCount: number } = {
    weight: 0,
    hasData: registrationCount > 0,
    rawValue: registrationCount,
    normalizedValue: registrationCount > 0 ? Math.min(100, registrationCount * 25) : null,
    contribution: null,
    registrationCount,
  };

  const { resolvePerformanceWeights } = await import("./performance-weights");
  const weights = resolvePerformanceWeights(data.settings.performanceWeights).teacher;
  const score = combineComponents({ attendance, feedback, tasks, homework, enrollmentFromSchedule }, weights);

  return {
    version: TEACHER_PERFORMANCE_V2_SCORE_VERSION,
    teacherId,
    periodStart,
    periodEnd,
    score,
    components: { attendance, feedback, tasks, homework, enrollmentFromSchedule },
  };
}
