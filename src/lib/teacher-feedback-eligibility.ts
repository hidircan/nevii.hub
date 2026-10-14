import type { Lesson, Student } from "./types";

/** Değerlendirmeye "yakın geçmiş" sayılan pencere (öğrenci portalı + kişiye özel link aynı kuralı kullanır). */
export const FEEDBACK_RECENT_LESSON_WINDOW_DAYS = 90;

/**
 * Öğrencinin değerlendirebileceği öğretmenler: atanmış öğretmen + aktif branş kayıtlarının öğretmenleri + son
 * `windowDays` günde bu öğrenciyle dersi olan öğretmenler. Liste sunucuda, öğrencinin GERÇEK kayıtlarından türetilir —
 * istemciden gelen bir öğretmen kimliği yalnız bu kümedeyse kabul edilir.
 */
export function eligibleFeedbackTeacherIds(
  student: Pick<Student, "id" | "teacherId" | "enrollments">,
  lessons: Pick<Lesson, "studentId" | "teacherId" | "startAt">[],
  nowMs: number,
  windowDays = FEEDBACK_RECENT_LESSON_WINDOW_DAYS
): string[] {
  const cutoff = nowMs - windowDays * 86_400_000;
  const ids = new Set<string>();
  if (student.teacherId) ids.add(student.teacherId);
  for (const e of student.enrollments ?? []) if (e.active && e.teacherId) ids.add(e.teacherId);
  for (const l of lessons) {
    if (l.studentId === student.id && l.teacherId && Date.parse(l.startAt) >= cutoff) ids.add(l.teacherId);
  }
  return [...ids].sort();
}
