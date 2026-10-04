/**
 * 2026-10-04 — tek öğrenci, birden fazla eğitim (saf yardımcılar; I/O yok).
 *
 * Kaynak: `Student.enrollments`. Alan yoksa (eski tek eğitimli kayıt) eğitimler öğrencinin eski alanlarından
 * TÜRETİLİR (kaydedilmez): her enstrüman bir eğitim, öğretmen yalnız o enstrümanı veriyorsa bağlanır — enstrüman
 * ile öğretmen birbirinden kopuk iki liste olarak yorumlanmaz. Veri birleştirme/taşıma yapılmaz.
 */
import type { Lesson, Student, StudentEnrollment, Teacher } from "./types";

export type EnrollmentView = StudentEnrollment & { legacy?: boolean };

export const LEGACY_ENROLLMENT_PREFIX = "legacy:";

export function effectiveEnrollments(
  student: Pick<Student, "id" | "enrollments" | "instruments" | "teacherId" | "lessonDurationMinutes" | "branchId" | "weeklyLessonCount" | "createdAt">,
  teachers?: Pick<Teacher, "id" | "instruments">[]
): EnrollmentView[] {
  if (student.enrollments && student.enrollments.length > 0) return student.enrollments;
  const teacher = teachers?.find((t) => t.id === student.teacherId);
  return (student.instruments ?? []).map((instrument, i) => ({
    id: `${LEGACY_ENROLLMENT_PREFIX}${student.id}:${instrument}`,
    instrument,
    // Tek enstrümanlı eski kayıtta öğretmen o eğitimindir; çok enstrümanlıda yalnız o enstrümanı verebiliyorsa.
    teacherId:
      student.instruments.length === 1 || !teacher || teacher.instruments.includes(instrument) ? student.teacherId : undefined,
    branchId: student.branchId,
    lessonDurationMinutes: student.lessonDurationMinutes,
    weeklyLessonCount: i === 0 ? student.weeklyLessonCount : undefined,
    active: true,
    primary: i === 0,
    createdAt: student.createdAt ?? "",
    legacy: true,
  }));
}

/** Dersin eğitimi: önce açık bağ (`enrollmentId`), yoksa enstrüman (+ öğretmen) eşleşmesi. */
export function enrollmentForLesson(
  enrollments: EnrollmentView[],
  lesson: Pick<Lesson, "enrollmentId" | "instrument" | "teacherId">
): EnrollmentView | undefined {
  if (lesson.enrollmentId) {
    const hit = enrollments.find((e) => e.id === lesson.enrollmentId);
    if (hit) return hit;
  }
  const byInstrument = enrollments.filter((e) => e.instrument === lesson.instrument);
  return byInstrument.find((e) => e.teacherId === lesson.teacherId) ?? byInstrument[0];
}

/** Öğrenciye eğitim üzerinden atanmış öğretmenler (aktif eğitimler + eski tekil öğretmen). */
export function studentTeacherIds(student: Pick<Student, "teacherId" | "enrollments">): Set<string> {
  const ids = new Set<string>([student.teacherId]);
  for (const e of student.enrollments ?? []) if (e.active && e.teacherId) ids.add(e.teacherId);
  return ids;
}

/**
 * Eğitim listesinden öğrencinin eski tekil alanlarını üretir (eski ekranlar/raporlar çalışmaya devam etsin):
 * instruments = aktif eğitimlerin enstrümanları, teacherId/ders süresi = birincil eğitim.
 */
export function primaryFieldsFromEnrollments(
  enrollments: StudentEnrollment[],
  fallback: Pick<Student, "teacherId" | "instruments" | "lessonDurationMinutes">
): Pick<Student, "teacherId" | "instruments" | "lessonDurationMinutes"> {
  const active = enrollments.filter((e) => e.active);
  const primary = active.find((e) => e.primary) ?? active[0];
  const instruments = Array.from(new Set(active.map((e) => e.instrument)));
  return {
    teacherId: primary?.teacherId ?? fallback.teacherId,
    instruments: instruments.length ? instruments : fallback.instruments,
    lessonDurationMinutes: (primary?.lessonDurationMinutes as Student["lessonDurationMinutes"]) ?? fallback.lessonDurationMinutes,
  };
}

export function enrollmentLabel(e: Pick<StudentEnrollment, "instrument" | "teacherId">, teachers: Pick<Teacher, "id" | "name">[]): string {
  const t = e.teacherId ? teachers.find((x) => x.id === e.teacherId)?.name : undefined;
  return t ? `${e.instrument} · ${t}` : e.instrument;
}
