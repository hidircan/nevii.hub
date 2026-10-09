/**
 * 2026-10-10 — CSV içe aktarımında MEVCUT öğrenci eşleşmesinin (telefon) birleştirme kuralı (saf; json/memory store
 * ortak kullanır, db aynı kuralı Prisma verisiyle uygular).
 *
 * Kalıcı BRANŞ KAYDI olan öğrencide enstrüman listesi, öğretmen, paket/ücret, haftalık ders, ders süresi, kayıt tarihi gibi
 * branşa özgü koşullar KAYITLARDA durur; CSV satırı bunları (tek enstrümanlı bir satırla) EZEMEZ — ezerse çok branşlı
 * öğrencinin diğer branşı satırdan silinmiş görünürdü. Yalnız kişi düzeyi alanlar güncellenir; branş koşulları
 * Öğrenci → Branş kayıtları ekranından değişir.
 */
import type { Student } from "../types";
import type { StudentImportRow } from "./students";

export function mergeImportRowIntoStudent(existing: Student, row: StudentImportRow, nextDisplayId: () => string): Student {
  const personLevel: Partial<Student> = {
    name: row.name,
    email: row.email || existing.email,
    parentName: row.parentName,
    parentPhone: row.parentPhone,
    branchId: row.branchId,
    notes: row.notes || existing.notes,
    birthDate: row.birthDate ?? existing.birthDate,
    birthPlace: row.birthPlace ?? existing.birthPlace,
    schoolOrOccupation: row.schoolOrOccupation ?? existing.schoolOrOccupation,
    address: row.address ?? existing.address,
    nationalIdCipher: row.nationalIdCipher ?? existing.nationalIdCipher,
    nationalIdLast2: row.nationalIdLast2 ?? existing.nationalIdLast2,
    accountResponsibility: existing.accountResponsibility ?? row.accountResponsibility,
    displayId: existing.displayId ?? nextDisplayId(),
  };
  if (existing.enrollments && existing.enrollments.length > 0) return { ...existing, ...personLevel };
  return {
    ...existing,
    ...personLevel,
    instruments: [row.instrument],
    teacherId: row.teacherId,
    packageName: row.packageName,
    weeklyLessonCount: row.weeklyLessonCount,
    monthlyFee: row.monthlyFee,
    lessonDurationMinutes: row.lessonDurationMinutes ?? existing.lessonDurationMinutes,
    enrollmentStartDate: row.enrollmentStartDate ?? existing.enrollmentStartDate,
    derivedPerLessonAmount: row.derivedPerLessonAmount ?? existing.derivedPerLessonAmount,
  };
}
