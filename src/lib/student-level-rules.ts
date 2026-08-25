/**
 * PRODUCT_BACKLOG §1.1 — öğrenci türüne göre seviye görünürlük/zorunluluk.
 */

import type { StudentType } from "./types";
import {
  isLcmStudentType,
  isMebStudentType,
  hasLcmStudentType,
  hasMebStudentType,
  studentLevelRequired,
  studentLevelVisible,
} from "./types";

export { isLcmStudentType, isMebStudentType, hasLcmStudentType, hasMebStudentType, studentLevelRequired, studentLevelVisible };

const MEB_LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export type MebLevel = (typeof MEB_LEVELS)[number];
export const MEB_LEVEL_OPTIONS: readonly MebLevel[] = MEB_LEVELS;

export function isValidMebLevel(level: string | undefined): level is MebLevel {
  return !!level && (MEB_LEVELS as readonly string[]).includes(level);
}

/**
 * Validation helper: returns error message or null if ok. Faz 1B — öğrenci
 * birden fazla türe sahip olabilir; MEB'in KATI kuralı (seviye zorunlu 1–8)
 * diğer türlerle birlikte atanmışsa bile her zaman kazanır.
 * - Türlerden biri MEB ise: level zorunlu 1–8
 * - Türlerden biri (MEB hariç) LCM ise: level opsiyonel (serbest metin)
 * - Diğer: level olmamalı (varsa yok sayılır / hata)
 */
export function validateStudentLevel(studentTypes: StudentType[], level: string | undefined): string | null {
  if (hasMebStudentType(studentTypes)) {
    if (!level || !isValidMebLevel(level)) {
      return "MEB öğrencilerinde seviye 1–8 zorunludur.";
    }
    return null;
  }
  if (hasLcmStudentType(studentTypes)) {
    return null; // optional free text
  }
  if (level && level.trim()) {
    return "Bu öğrenci türünde seviye alanı kullanılmaz.";
  }
  return null;
}

/** UI: "Kayıt Tarihi" — enrollmentStartDate alanının kullanıcı etiketi */
export const ENROLLMENT_DATE_LABEL = "Kayıt Tarihi";
