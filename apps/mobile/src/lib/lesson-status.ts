import type { Lesson } from "../types/api";
import type { Locale } from "../i18n/locales";
import { lookup } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";
import type { BadgeTone } from "../components/ui/status-badge";
import { attendanceStatusForLesson, attendanceStatusStyle } from "../features/attendance/status-style";

/**
 * Ders statü rozeti — ekranda bağımsız İKİNCİ bir çözümleyici DEĞİLDİR:
 * `features/attendance/status-style.ts` (web'in `resolveLessonFinalStatus`
 * port'u) statü kodunu üretir; burada yalnız etiket + ton çözülür. Etiketler
 * i18n sözlüğünün `attStatus.*` anahtarlarından gelir (TEK kaynak).
 *
 * Daha önce burada webi TERS sıralayan bağımsız bir öncelik vardı
 * (işlendi > katıldı > telafi > ...): webin Ders Programı ile aynı derste
 * FARKLI statü gösteriyordu. Artık dört portal + rozet bileşeni TEK
 * resolveri okur (İş 2, 2026-10-30).
 */
export function lessonStatusBadge(
  lesson: Lesson,
  locale: Locale = getActiveLocale(),
): { label: string; tone: BadgeTone } {
  const style = attendanceStatusStyle(attendanceStatusForLesson(lesson));
  return { label: lookup(locale, style.labelKey), tone: style.tone };
}

/**
 * Öğrenci/veli yüzeyi — yönetici/öğretmen rozetiyle AYNI resolver. İmza,
 * mevcut çağrı noktalarını kırmamak için korunur.
 */
export function studentFacingLessonStatus(
  lesson: Lesson,
  locale: Locale = getActiveLocale(),
): { label: string; tone: BadgeTone } {
  return lessonStatusBadge(lesson, locale);
}
