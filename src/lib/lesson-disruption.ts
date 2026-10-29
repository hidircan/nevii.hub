/**
 * 9. tur (2026-09-28) — İptal/Telafi kararının KAYNAĞI. Tek kaynak modül.
 *
 * Üç ayrı bilgi birbirine karışmaz:
 *  - Ders statüsü: `Lesson.status` ("cancelled") / `opsMakeupFlag` (Telafi).
 *  - Kaynak: `disruptionSource` — kim/ne yüzünden (bu modül).
 * Ayrı bir "öğretmen yoklaması" YOK (2026-10-21 owner kararı ile kaldırıldı):
 * öğretmen performansını etkileyen tek veri, iptal/telafi kararında seçilen
 * "Öğretmen kaynaklı" kaynaktır (`isTeacherCausedDisruption`). Kurum/öğrenci
 * kaynaklı veya kaynağı belirtilmemiş karar öğretmene asla yazılmaz.
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

/** Öğretmen kaynaklı aksama: iptal/telafi edilmiş VE kaynağı açıkça "teacher". Performans/rapor/hakedişin tek kuralı. */
export function isTeacherCausedDisruption(lesson: Pick<Lesson, "status" | "opsMakeupFlag" | "disruptionSource">): boolean {
  return isDisruptedLesson(lesson) && lesson.disruptionSource === "teacher";
}

/**
 * Öğretmen performansının "ders güvenilirliği" bileşeni (v1 + v2 ortak, tek kural).
 * Taban: dönemdeki gerçekleşmiş (geçmiş, aksamamış) dersler + öğretmen kaynaklı aksamalar.
 * Kurum/öğrenci/diğer/belirtilmemiş kaynaklı iptal-telafi nötrdür (tabana girmez).
 * Öğrenci yoklaması (Geldi/Gelmedi/İşlendi) burada HİÇ okunmaz.
 */
export function teacherReliability<L extends Pick<Lesson, "teacherId" | "startAt" | "status" | "opsMakeupFlag" | "disruptionSource">>(
  lessons: L[],
  teacherId: string,
  rangeStartMs: number,
  rangeEndMs: number,
  nowMs: number = Date.now()
): { counted: L[]; teacherCaused: L[]; rate: number | null } {
  const counted = lessons.filter((l) => {
    if (l.teacherId !== teacherId) return false;
    const t = new Date(l.startAt).getTime();
    if (t < rangeStartMs || t > rangeEndMs) return false;
    return isTeacherCausedDisruption(l) || (!isDisruptedLesson(l) && t < nowMs);
  });
  const teacherCaused = counted.filter(isTeacherCausedDisruption);
  return { counted, teacherCaused, rate: counted.length > 0 ? 1 - teacherCaused.length / counted.length : null };
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
