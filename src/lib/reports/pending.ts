import type { Lesson } from "../types";

/** Rapor portalı: geriye dönük kaç günün dersleri "rapor bekliyor" sayılır. */
export const PENDING_LESSON_WINDOW_DAYS = 14;

/**
 * Raporu bekleyen dersler: son 14 gün içinde başlamış (gelecek değil), öğretmenin kendi dersi, iptal/gelmedi değil,
 * öğrencisi olan ve henüz gelişim raporu yazılmamış dersler — en yeni önce. `teacherId` null → tüm öğretmenler (yönetici).
 */
export function pendingLessonAssessments<L extends Pick<Lesson, "id" | "studentId" | "teacherId" | "startAt" | "status">>(
  lessons: L[],
  assessedLessonIds: Set<string>,
  teacherId: string | null,
  nowMs: number
): L[] {
  const from = nowMs - PENDING_LESSON_WINDOW_DAYS * 86_400_000;
  return lessons
    .filter((l) => {
      const t = Date.parse(l.startAt);
      return (
        Boolean(l.studentId) &&
        (teacherId === null || l.teacherId === teacherId) &&
        t >= from &&
        t <= nowMs &&
        l.status !== "cancelled" &&
        l.status !== "no_show" &&
        !assessedLessonIds.has(l.id)
      );
    })
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
}
