/**
 * EPIC 6B (IMPLEMENTATION_PLAN.md) — bir TeachingMaterial'ın bir öğrenciye
 * görünüp görünmediğini belirleyen saf fonksiyon. Hedefleme alanlarının
 * (targetStudentType/targetInstrument/targetLevel) HER BİRİ ayrı ayrı ele
 * alınır: dolu olan alan öğrencininkiyle EŞLEŞMEK zorunda, boş (undefined)
 * olan alan o eksende sınırlama YAPMAZ. Materyal her zaman kendi öğretmeninin
 * öğrencisine görünür — çapraz öğretmen görünürlüğü asla olmaz (çağıran
 * taraf ayrıca `material.teacherId === student.teacherId` kontrolü yapmalı).
 */

import type { Instrument, StudentType, TeachingMaterial } from "./types";
import { effectiveStudentTypes } from "./student-types";
import { effectiveEnrollments, enrollmentTerms } from "./student-enrollments";
import type { Student, Teacher } from "./types";

export function matchesMaterialAudience(
  material: Pick<TeachingMaterial, "targetStudentType" | "targetInstrument" | "targetLevel">,
  student: { studentType?: StudentType; studentTypes?: StudentType[]; instruments: Instrument[]; level?: string }
): boolean {
  // Faz 1B — öğrenci birden fazla türe sahip olabilir; hedeflenen tür
  // ATANMIŞ türlerden HERHANGİ biriyse eşleşir (exact-match yerine includes).
  if (material.targetStudentType && !effectiveStudentTypes(student).includes(material.targetStudentType)) {
    return false;
  }
  if (
    material.targetInstrument &&
    !student.instruments.includes(material.targetInstrument)
  ) {
    return false;
  }
  if (material.targetLevel && material.targetLevel !== student.level) {
    return false;
  }
  return true;
}


/**
 * 2026-10-10 — çok branşlı öğrenci için materyal görünürlüğü BRANŞ başınadır: materyal, öğrencinin AKTİF bir branşının
 * öğretmenine aitse ve hedefleme (tür/enstrüman/seviye) AYNI branşın bilgisiyle eşleşiyorsa görünür. Bir branşın türü/seviyesi
 * diğer branşın enstrümanıyla karışmaz. Kalıcı branşı olmayan / tek branşlı öğrencide eski kural (öğrencinin öğretmeni).
 */
export function materialVisibleToStudent(
  material: Pick<TeachingMaterial, "teacherId" | "targetStudentType" | "targetInstrument" | "targetLevel">,
  student: Pick<Student, "id" | "enrollments" | "instruments" | "teacherId" | "lessonDurationMinutes" | "branchId" | "weeklyLessonCount" | "createdAt" | "studentTypes" | "studentType" | "packageId" | "packageName" | "monthlyFee" | "level">,
  teachers: Pick<Teacher, "id" | "instruments">[]
): boolean {
  const active = effectiveEnrollments(student, teachers).filter((e) => e.active);
  if (active.length <= 1) {
    return material.teacherId === student.teacherId && matchesMaterialAudience(material, student);
  }
  return active.some((e) => {
    const t = enrollmentTerms(student, e, teachers);
    return (
      t.teacherId === material.teacherId &&
      matchesMaterialAudience(material, { studentTypes: t.studentTypes, instruments: [t.instrument as Instrument], level: t.level })
    );
  });
}

/** Öğrencinin materyallerini okumak için gereken öğretmen kimlikleri (çok branşlıda her aktif branşın öğretmeni). */
export function materialTeacherIdsForStudent(
  student: Parameters<typeof materialVisibleToStudent>[1],
  teachers: Pick<Teacher, "id" | "instruments">[]
): string[] {
  const active = effectiveEnrollments(student, teachers).filter((e) => e.active);
  if (active.length <= 1) return [student.teacherId];
  return [...new Set(active.map((e) => enrollmentTerms(student, e, teachers).teacherId).filter((x): x is string => !!x))];
}
