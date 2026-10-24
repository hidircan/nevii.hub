import type { AppData } from "../types";
import { isOwnStudent } from "../teacher-portal-scope";

/**
 * Deterministic teacher performance score — NO AI/LLM involved in the
 * number itself (only an optional narration layer on top, via the
 * `teacherPerformanceScore` AI capability). Based only on attendance
 * records that already happened (`Attendance` rows), never invented data.
 */
export type TeacherPerformanceScore = {
  teacherId: string;
  /** 0–100, or null when there isn't enough graded history to score fairly. */
  score: number | null;
  gradedLessonCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  schoolCancelledCount: number;
  activeStudentCount: number;
};

const MIN_GRADED_LESSONS_FOR_SCORE = 3;

/**
 * DB egress (2026-10-18) — puan yalnız (dersin öğretmeni, yoklama statüsü) çiftlerine bakar; db bunu tam okuma
 * yerine tek dar sorguyla üretir (`store.readTeacherAttendanceRows`), json/memory bu fonksiyonla.
 */
export type TeacherAttendanceRow = { teacherId: string; status: string };

export function teacherAttendanceRows(data: Pick<AppData, "lessons" | "attendances">): TeacherAttendanceRow[] {
  const teacherByLesson = new Map(data.lessons.map((l) => [l.id, l.teacherId]));
  return data.attendances.flatMap((a) => {
    const teacherId = teacherByLesson.get(a.lessonId);
    return teacherId ? [{ teacherId, status: a.status }] : [];
  });
}

export function computeTeacherPerformanceScore(data: AppData, teacherId: string): TeacherPerformanceScore {
  return scoreTeacherFromRows(teacherAttendanceRows(data), data.students, teacherId);
}

export function scoreTeacherFromRows(
  rows: TeacherAttendanceRow[],
  students: import("../types").StudentRef[],
  teacherId: string
): TeacherPerformanceScore {
  const graded = rows.filter((a) => a.teacherId === teacherId);

  const presentCount = graded.filter((a) => a.status === "present").length;
  const lateCount = graded.filter((a) => a.status === "late").length;
  const absentCount = graded.filter((a) => a.status === "absent").length;
  const schoolCancelledCount = graded.filter((a) => a.status === "cancelled_by_school").length;
  const gradedLessonCount = graded.length;
  const activeStudentCount = students.filter((s) => isOwnStudent(s, teacherId) && s.active).length;

  let score: number | null = null;
  if (gradedLessonCount >= MIN_GRADED_LESSONS_FOR_SCORE) {
    // Present = full credit, late = partial credit; school-side cancellations
    // (teacher/school initiated, per attendance.ts reason convention) are a
    // direct penalty since they are attributable to the teacher/school, not
    // the student.
    const raw =
      ((presentCount + lateCount * 0.6) / gradedLessonCount) * 100 -
      (schoolCancelledCount / gradedLessonCount) * 20;
    score = Math.max(0, Math.min(100, Math.round(raw)));
  }

  return {
    teacherId,
    score,
    gradedLessonCount,
    presentCount,
    lateCount,
    absentCount,
    schoolCancelledCount,
    activeStudentCount,
  };
}

export function computeAllTeacherPerformanceScores(data: AppData): TeacherPerformanceScore[] {
  return data.teachers.map((t) => computeTeacherPerformanceScore(data, t.id));
}
