/**
 * 9. tur (2026-09-28) — İptal/Telafi kararının KAYNAĞI. Tek kaynak modül.
 *
 * Üç ayrı bilgi birbirine karışmaz:
 *  - Ders statüsü: `Lesson.status` ("cancelled") / `opsMakeupFlag` (Telafi).
 *  - Kaynak: `disruptionSource` — kim/ne yüzünden (bu modül).
 *  - Öğretmen katılımı: `teacherAttendanceStatus` (teacher-attendance.ts).
 * "İptal" veya "Telafi" tek başına "öğretmen gelmedi" DEMEK DEĞİLDİR. Öğretmen
 * katılımı yalnız kullanıcı açıkça seçerse yazılır; kurum kaynaklı iptal
 * öğretmen devamsızlığına asla yazılmaz.
 *
 * Owner kararları (2026-09-27):
 *  - Öğretmen/kurum kaynaklı telafi öğrencinin kişisel telafi hakkından DÜŞMEZ;
 *    öğrenci kaynaklı (ve kaynağı belirtilmemiş eski) telafi mevcut kotaya tabidir.
 *  - Öğretmen devamsızlığı hakedişten OTOMATİK kesinti üretmez.
 */
import type { Lesson } from "./types";

export const DISRUPTION_SOURCES = ["teacher", "institution", "student", "other"] as const;
export type DisruptionSource = (typeof DISRUPTION_SOURCES)[number];

export const DISRUPTION_SOURCE_LABEL: Record<DisruptionSource, string> = {
  teacher: "Öğretmen kaynaklı",
  institution: "Kurum kaynaklı",
  student: "Öğrenci kaynaklı",
  other: "Diğer",
};

export const DISRUPTION_UNSPECIFIED_LABEL = "Belirtilmemiş";

export function isDisruptionSource(value: unknown): value is DisruptionSource {
  return typeof value === "string" && (DISRUPTION_SOURCES as readonly string[]).includes(value);
}

/** Öğrencinin kişisel telafi hakkından düşmeyen kaynaklar. */
export function isQuotaExemptSource(source: string | null | undefined): boolean {
  return source === "teacher" || source === "institution";
}

/** Ders iptal edilmiş veya telafiye alınmış mı (kaynak sorusunun anlamlı olduğu dersler). */
export function isDisruptedLesson(lesson: Pick<Lesson, "status" | "opsMakeupFlag">): boolean {
  return lesson.status === "cancelled" || lesson.opsMakeupFlag === true;
}

export type LessonDisruptionInput = { source: DisruptionSource; note?: string };

export type LessonDisruptionPatch = Pick<Lesson, "disruptionSource" | "disruptionNote" | "disruptionAt" | "disruptionBy">;

export function buildDisruptionPatch(input: LessonDisruptionInput, actorUserId: string, now: Date = new Date()): LessonDisruptionPatch {
  const note = input.note?.trim();
  return {
    disruptionSource: input.source,
    disruptionNote: note ? note.slice(0, 500) : undefined,
    disruptionAt: now.toISOString(),
    disruptionBy: actorUserId,
  };
}

export function disruptionSourceLabel(source: string | null | undefined): string {
  return isDisruptionSource(source) ? DISRUPTION_SOURCE_LABEL[source] : DISRUPTION_UNSPECIFIED_LABEL;
}
