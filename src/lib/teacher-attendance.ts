/**
 * Faz 2 — öğretmenin KENDİ derse gelip gelmediğini kaydeder. Öğrenci
 * yoklamasıyla (lesson-ops.ts) TAMAMEN AYRI bir alan kümesi ve akış —
 * kasıtlı olarak birbirine bağlanmaz (bkz. src/lib/teacher-performance.ts
 * modül yorumu, "öğrenci yoklaması skora asla girmez" kuralı).
 */
import type { AppData, Lesson } from "./types";

export type TeacherAttendanceStatus = "geldi" | "gelmedi" | "mazeretli";

export type MarkTeacherAttendanceResult =
  | { ok: true; alreadySet: boolean; data: AppData; lesson: Lesson }
  | { ok: false; message: string };

export function markTeacherAttendance(
  data: AppData,
  lessonId: string,
  status: TeacherAttendanceStatus,
  actorUserId: string,
  note: string | undefined,
  now: Date = new Date()
): MarkTeacherAttendanceResult {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { ok: false, message: "Ders bulunamadı." };

  if (lesson.teacherAttendanceStatus === status && (note ?? "") === (lesson.teacherAttendanceNote ?? "")) {
    return { ok: true, alreadySet: true, data, lesson };
  }

  const patch: Pick<
    Lesson,
    "teacherAttendanceStatus" | "teacherAttendanceAt" | "teacherAttendanceBy" | "teacherAttendanceNote"
  > = {
    teacherAttendanceStatus: status,
    teacherAttendanceAt: now.toISOString(),
    teacherAttendanceBy: actorUserId,
    teacherAttendanceNote: note,
  };
  const lessons = data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l));
  const next = { ...data, lessons };
  return { ok: true, alreadySet: false, data: next, lesson: lessons.find((l) => l.id === lessonId)! };
}
