/**
 * 2026-10-15 — Öğretmen/öğrenci "Bilgiler" kartları: her bölümün "Düzenle"si YALNIZ o bölümün alanlarını açar ve
 * kaydederken YALNIZ onları gönderir. Güncelleme araçları patch semantiğindedir (gönderilmeyen alan değişmez),
 * böylece "İletişim"i kaydetmek "Genel Bilgiler"e veya şube atamasına dokunmaz. Eskiden üç kart da aynı tam
 * formu açıyordu. Alan adları `updateTeacherProfileSchema` / `updateStudentProfileSchema` ile aynıdır.
 */

export const TEACHER_PROFILE_SECTIONS = {
  general: [
    "name",
    "birthDate",
    "highSchool",
    "university",
    "graduationYear",
    "maxDailyLessons",
    "weeklyHoursThreshold",
    "branchId",
    "branchIds",
    "nationalId",
  ],
  contact: ["email", "phone", "address", "emergencyContactName", "emergencyContactPhone"],
  employment: ["employmentType", "hireDate", "terminationDate", "contractStartDate", "contractEndDate", "personnelNotes"],
} as const;

export const STUDENT_PROFILE_SECTIONS = {
  basic: [
    "name",
    "branchId",
    "educationMethod",
    "lessonDurationMinutes",
    "studentTypes",
    "level",
    "mebLevelStartDate",
    "mebLevelEndDate",
    "mebExamDate",
    "mebExamAttended",
    "birthDate",
    "birthPlace",
    "schoolOrOccupation",
    "address",
    "referralSource",
    "referralSourceDetail",
    "enrollmentStartDate",
    "lessonStartDate",
    "nationalId",
  ],
  contact: ["email", "phone", "parentName", "parentPhone", "motherName", "fatherName", "accountResponsibility", "communicationOptOut"],
} as const;

export type TeacherProfileSection = keyof typeof TEACHER_PROFILE_SECTIONS;
export type StudentProfileSection = keyof typeof STUDENT_PROFILE_SECTIONS;

/** Bölüm verilmemişse (tam form) her alan; verilmişse yalnız o bölümün alanları. */
export function sectionHas(fields: readonly string[] | undefined, key: string): boolean {
  return !fields || fields.includes(key);
}

/** Tam form değerlerinden yalnız bölümün alanlarını alır — diğer alanlar patch'te HİÇ yer almaz. */
export function pickSectionFields<T extends Record<string, unknown>>(full: T, fields: readonly string[] | undefined): Partial<T> {
  if (!fields) return full;
  return Object.fromEntries(Object.entries(full).filter(([k]) => fields.includes(k))) as Partial<T>;
}
