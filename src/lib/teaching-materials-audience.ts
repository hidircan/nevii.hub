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
