/**
 * 9. tur (2026-09-28) — Öğretmen aksama raporu (iptal/telafi kaynağı). Saf; RBAC/tenant tool katmanında.
 *
 * Tek eksen — İptal/Telafi kaynağı, yalnız iptal edilmiş veya telafiye alınmış derslerde:
 * Öğretmen kaynaklı / Kurum kaynaklı / Öğrenci-Diğer / Belirtilmemiş. Ayrı öğretmen
 * yoklaması yok (2026-10-21); öğretmen aksaması = "Öğretmen kaynaklı" sütunu.
 *     Eski kayıtlar "Belirtilmemiş" kalır; öğretmene/kuruma sessizce atanmaz.
 * Telafi dersi ayrı bir ders kaydıdır; kaynak yalnız ASIL (iptal/telafiye alınan)
 * derste sayılır, telafi dersi yeni bir "öğretmen kaynaklı" olay üretmez.
 * Uzlaşma: her sütunun toplamı = o kategorideki detay satırı sayısı
 * (`teacherAttendanceDetail` aynı sınıflandırıcıyı kullanır).
 * Devamsızlık hakedişten OTOMATİK kesinti üretmez (owner kararı).
 */
import { toZonedYmd, DEFAULT_APP_TIMEZONE } from "./timezone";
import { isDisruptedLesson } from "./lesson-disruption";
import type { Lesson } from "./types";

export type TeacherAttendanceCategory =
  | "teacher_source"
  | "institution_source"
  | "student_other_source"
  | "unspecified_source";

export const TEACHER_ATTENDANCE_CATEGORY_LABEL: Record<TeacherAttendanceCategory, string> = {
  teacher_source: "Öğretmen kaynaklı iptal/telafi",
  institution_source: "Kurum kaynaklı iptal/telafi",
  student_other_source: "Öğrenci kaynaklı / diğer",
  unspecified_source: "Nedeni belirtilmemiş",
};

type ReportLesson = Pick<
  Lesson,
  "id" | "teacherId" | "branchId" | "studentId" | "startAt" | "status" | "opsMakeupFlag" | "type" | "disruptionSource"
>;

export type TeacherAttendanceFilters = { from: string; to: string; branchId?: string; teacherId?: string };

export function lessonTeacherCategories(lesson: ReportLesson): TeacherAttendanceCategory[] {
  const out: TeacherAttendanceCategory[] = [];
  if (isDisruptedLesson(lesson)) {
    const s = lesson.disruptionSource;
    out.push(
      s === "teacher"
        ? "teacher_source"
        : s === "institution"
          ? "institution_source"
          : s === "student" || s === "other"
            ? "student_other_source"
            : "unspecified_source"
    );
  }
  return out;
}

function inScope(lesson: ReportLesson, f: TeacherAttendanceFilters): boolean {
  const day = toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE);
  if (day < f.from || day > f.to) return false;
  if (f.branchId && lesson.branchId !== f.branchId) return false;
  if (f.teacherId && lesson.teacherId !== f.teacherId) return false;
  return true;
}

export type TeacherAttendanceRow = { teacherId: string; lessonCount: number } & Record<TeacherAttendanceCategory, number>;

function emptyCounts(): Record<TeacherAttendanceCategory, number> {
  return {
    teacher_source: 0,
    institution_source: 0,
    student_other_source: 0,
    unspecified_source: 0,
  };
}

export function buildTeacherAttendanceReport(
  lessons: ReportLesson[],
  filters: TeacherAttendanceFilters
): { rows: TeacherAttendanceRow[]; totals: TeacherAttendanceRow } {
  const byTeacher = new Map<string, TeacherAttendanceRow>();
  const totals: TeacherAttendanceRow = { teacherId: "", lessonCount: 0, ...emptyCounts() };
  for (const lesson of lessons) {
    if (!inScope(lesson, filters)) continue;
    let row = byTeacher.get(lesson.teacherId);
    if (!row) {
      row = { teacherId: lesson.teacherId, lessonCount: 0, ...emptyCounts() };
      byTeacher.set(lesson.teacherId, row);
    }
    row.lessonCount += 1;
    totals.lessonCount += 1;
    for (const c of lessonTeacherCategories(lesson)) {
      row[c] += 1;
      totals[c] += 1;
    }
  }
  return { rows: Array.from(byTeacher.values()), totals };
}

/** Rapordan inilen ders listesi — sütunla AYNI sınıflandırıcı (uzlaşma garantisi). */
export function teacherAttendanceDetail<L extends ReportLesson>(
  lessons: L[],
  filters: TeacherAttendanceFilters,
  category: TeacherAttendanceCategory | undefined
): L[] {
  return lessons
    .filter((l) => inScope(l, filters) && (!category || lessonTeacherCategories(l).includes(category)))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
