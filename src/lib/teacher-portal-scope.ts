import type { Lesson, Student, TeacherPayout } from "./types";

/**
 * Öğretmen portalı erişim sınırlaması — saf yardımcılar. Hiçbir hesaplama
 * kuralı içermez, yalnızca "bu kayıt gerçekten bu öğretmene mi ait"
 * sorusunu yanıtlar. URL'den gelen bir payoutId / studentId başka bir
 * öğretmene aitse ilgili `findOwn*` her zaman `undefined` döner — çağıran
 * taraf bunu "bulunamadı" olarak göstermelidir, asla başka öğretmenin
 * verisini sızdırmamalıdır.
 */

export function ownPayouts(payouts: TeacherPayout[], teacherId: string): TeacherPayout[] {
  // İptal edilmiş hakediş öğretmene gösterilmez (toplam/liste dışı).
  return payouts.filter((p) => p.teacherId === teacherId && p.status !== "cancelled");
}

export function findOwnPayout(
  payouts: TeacherPayout[],
  payoutId: string,
  teacherId: string
): TeacherPayout | undefined {
  const payout = payouts.find((p) => p.id === payoutId);
  if (!payout || payout.teacherId !== teacherId || payout.status === "cancelled") return undefined;
  return payout;
}

/** Yalnızca bu öğretmene atanmış öğrenciler (aktif filtre çağıran tarafta). */
export function ownStudents(students: Student[], teacherId: string): Student[] {
  return students.filter((s) => isOwnStudent(s, teacherId));
}

/** 2026-10-04 — öğrencinin birincil öğretmeni VEYA aktif bir eğitiminin öğretmeni. */
export function isOwnStudent(student: Pick<Student, "teacherId" | "enrollments">, teacherId: string): boolean {
  return student.teacherId === teacherId || Boolean(student.enrollments?.some((e) => e.active && e.teacherId === teacherId));
}

/**
 * URL'den gelen studentId için sahiplik kontrolü. Başka öğretmenin öğrencisi
 * veya olmayan id → `undefined` (bilgi sızıntısı yok).
 */
export function findOwnStudent(
  students: Student[],
  studentId: string,
  teacherId: string
): Student | undefined {
  const student = students.find((s) => s.id === studentId);
  if (!student || !isOwnStudent(student, teacherId)) return undefined;
  return student;
}

/** Bu öğretmenin, bu öğrenciyle olan dersleri (tarih azalan). */
export function ownStudentLessons(
  lessons: Lesson[],
  teacherId: string,
  studentId: string
): Lesson[] {
  return lessons
    .filter((l) => l.teacherId === teacherId && l.studentId === studentId)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
}

/** `weekStartIso` dahil, `weekEndIso` hariç aralıktaki, yalnızca bu öğretmenin dersleri. */
export function ownWeekLessons(
  lessons: Lesson[],
  teacherId: string,
  weekStartIso: string,
  weekEndIso: string
): Lesson[] {
  return lessons
    .filter((l) => l.teacherId === teacherId && l.startAt >= weekStartIso && l.startAt < weekEndIso)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
