/**
 * Faz 1B — öğrenci artık birden fazla türe (ör. hem "MEB" hem "London
 * College of Music Hazırlık") aynı anda sahip olabilir. `effectiveStudentTypes`
 * yeni `studentTypes` dizisini önceliklendirir, yoksa legacy tekil
 * `studentType`'tan tek-elemanlı bir dizi türetir — `payment-due-ranges.ts`
 * ile AYNI geriye-uyumluluk deseni.
 */
import type { Student, StudentType } from "./types";

export function effectiveStudentTypes(student: Pick<Student, "studentTypes" | "studentType">): StudentType[] {
  if (student.studentTypes && student.studentTypes.length > 0) return student.studentTypes;
  return student.studentType ? [student.studentType] : [];
}

/** İnsan-okunur, virgülle ayrılmış gösterim. Boşsa "Belirtilmemiş". */
export function formatStudentTypes(types: StudentType[]): string {
  return types.length > 0 ? types.join(", ") : "Belirtilmemiş";
}
