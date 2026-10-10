/**
 * 9. tur (2026-09-28) — Öğretmen Yoklama Raporu. Saf; RBAC/tenant tool katmanında.
 *
 * İki BAĞIMSIZ eksen, aynı dersi iki kez aynı sütunda saymaz:
 *  1) Öğretmen katılımı (`teacherAttendanceStatus`): Katıldı / Gelmedi / Mazeretli,
 *     geçmiş ve iptal edilmemiş derste girilmemişse "Girilmedi".
 *  2) İptal/Telafi kaynağı — yalnız iptal edilmiş veya telafiye alınmış derslerde:
 *     Öğretmen kaynaklı / Kurum kaynaklı / Öğrenci-Diğer / Belirtilmemiş.
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
  | "attended"
  | "absent"
  | "excused"
  | "unmarked"
  | "teacher_source"
  | "institution_source"
  | "student_other_source"
  | "unspecified_source";

export const TEACHER_ATTENDANCE_CATEGORY_LABEL: Record<TeacherAttendanceCategory, string> = {
  attended: "Katıldı",
  absent: "Gelmedi",
  excused: "Mazeretli",
  unmarked: "Katılım girilmedi",
  teacher_source: "Öğretmen kaynaklı iptal/telafi",
  institution_source: "Kurum kaynaklı iptal/telafi",
  student_other_source: "Öğrenci kaynaklı / diğer",
  unspecified_source: "Nedeni belirtilmemiş",
};

type ReportLesson = Pick<
  Lesson,
  "id" | "teacherId" | "branchId" | "studentId" | "startAt" | "status" | "opsMakeupFlag" | "type" | "teacherAttendanceStatus" | "disruptionSource"
>;

export type TeacherAttendanceFilters = { from: string; to: string; branchId?: string; teacherId?: string };

export function lessonTeacherCategories(lesson: ReportLesson, now: Date): TeacherAttendanceCategory[] {
  const out: TeacherAttendanceCategory[] = [];
  if (lesson.teacherAttendanceStatus === "geldi") out.push("attended");
  else if (lesson.teacherAttendanceStatus === "gelmedi") out.push("absent");
  else if (lesson.teacherAttendanceStatus === "mazeretli") out.push("excused");
  else if (lesson.status !== "cancelled" && new Date(lesson.startAt).getTime() < now.getTime()) out.push("unmarked");
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
    attended: 0,
    absent: 0,
    excused: 0,
    unmarked: 0,
    teacher_source: 0,
    institution_source: 0,
    student_other_source: 0,
    unspecified_source: 0,
  };
}

export function buildTeacherAttendanceReport(
  lessons: ReportLesson[],
  filters: TeacherAttendanceFilters,
  now: Date = new Date()
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
    for (const c of lessonTeacherCategories(lesson, now)) {
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
  category: TeacherAttendanceCategory | undefined,
  now: Date = new Date()
): L[] {
  return lessons
    .filter((l) => inScope(l, filters) && (!category || lessonTeacherCategories(l, now).includes(category)))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
