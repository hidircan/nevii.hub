/**
 * P0 UAT (2026-09-08) — statü değişiminde kart renginin ANINDA dönmesi için
 * iyimser (optimistic) statü katmanı. Saf fonksiyonlar: DOM'dan ve React'ten
 * bağımsız test edilir.
 *
 * KÖK NEDEN: Ders Programı kartının dolgusu `lessonCardStatusVisual(lesson)`
 * ile SUNUCU prop'undan çiziliyordu. `LessonOpsActions` kendi içinde iyimserdi
 * ama karta bir geri çağrı vermiyordu; kart yeni rengi ancak
 * `router.refresh()` → server action + revalidation + tam-tenant okuma turu
 * bittikten sonra alıyordu.
 */
import type { Lesson } from "./types";

/** `LessonOpsActions`'ın yaydığı "etkin statü" — hiçbiri etkin değilse null. */
export type LessonOpsFlagValue = "attended" | "processed" | "makeup" | "absent" | "excused" | null;

/** Bir dersin kalıcı alanlarından etkin ops statüsünü çözer (sunucu gerçeği). */
export function effectiveOpsFlag(lesson: Lesson): LessonOpsFlagValue {
  if (lesson.opsMakeupFlag) return "makeup";
  if (lesson.lessonProcessed) return "processed";
  if (lesson.studentAttended) return "attended";
  if (lesson.studentAbsent) return "absent";
  if (lesson.studentExcused) return "excused";
  return null;
}

/**
 * Dersi, iyimser statü ile ÜZERİNE YAZILMIŞ bir kopyasına dönüştürür.
 * `override` verilmediyse (undefined) ders aynen döner — referans korunur.
 *
 * Not: `null` override "hiçbir statü yok" demektir ve tüm bayrakları temizler;
 * bu, `LessonOpsActions`'ın hata sonrası geri alma yolunun karşılığıdır.
 */
export function applyOpsOverride(lesson: Lesson, override: LessonOpsFlagValue | undefined): Lesson {
  if (override === undefined) return lesson;
  return {
    ...lesson,
    studentAttended: override === "attended",
    lessonProcessed: override === "processed",
    opsMakeupFlag: override === "makeup",
    studentAbsent: override === "absent",
    studentExcused: override === "excused",
  };
}

/**
 * Sunucu verisi yakalayan override'ları düşürür.
 *
 * Sunucu HENÜZ yakalamadıysa override KORUNUR — böylece başarılı bir yanıtın
 * ardından gelen (henüz revalidate olmamış) eski prop, iyimser durumu EZMEZ.
 */
export function pruneSettledOverrides(
  overrides: Record<string, LessonOpsFlagValue>,
  lessons: Lesson[]
): Record<string, LessonOpsFlagValue> {
  const ids = Object.keys(overrides);
  if (ids.length === 0) return overrides;
  const byId = new Map(lessons.map((l) => [l.id, l]));
  let changed = false;
  const next: Record<string, LessonOpsFlagValue> = {};
  for (const id of ids) {
    const serverLesson = byId.get(id);
    if (serverLesson && effectiveOpsFlag(serverLesson) === overrides[id]) {
      changed = true; // sunucu yakaladı → override gereksiz
      continue;
    }
    next[id] = overrides[id]!;
  }
  return changed ? next : overrides;
}
