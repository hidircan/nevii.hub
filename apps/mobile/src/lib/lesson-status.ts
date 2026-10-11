import type { Lesson } from "../types/api";
import type { Locale } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";
import type { BadgeTone } from "../components/ui/status-badge";

/**
 * Web tarafındaki effectiveLessonOpsStatus önceliğiyle aynı sıra: işlendi > katıldı >
 * telafi > gelmedi > izinli > (geçmişse) sonuçlanmadı > planlandı.
 *
 * "Yoklama bekliyor" metni mobilde HİÇBİR yüzeyde üretilmez — yönetici
 * operasyon jargonudur. Sonuçlanmamış geçmiş ders için nötr
 * "Henüz sonuçlanmadı" kullanılır (öğrenci/veli/öğretmen/admin mobil
 * görünümlerinin tamamı salt-okunur özettir; operasyon dili web panelde).
 */
export function lessonStatusBadge(
  lesson: Lesson,
  locale: Locale = getActiveLocale(),
): { label: string; tone: BadgeTone } {
  const en = locale === "en";
  if (lesson.status === "cancelled") return { label: en ? "Cancelled" : "İptal edildi", tone: "neutral" };
  if (lesson.status === "no_show") return { label: en ? "Absent" : "Gelmedi", tone: "danger" };
  if (lesson.lessonProcessed) return { label: en ? "Processed" : "İşlendi", tone: "success" };
  if (lesson.studentAttended) return { label: en ? "Attended" : "Katıldı", tone: "success" };
  if (lesson.opsMakeupFlag) return { label: en ? "Makeup pending" : "Telafi bekliyor", tone: "warning" };
  if (lesson.studentAbsent) return { label: en ? "Absent" : "Gelmedi", tone: "danger" };
  if (lesson.studentExcused) return { label: en ? "Excused" : "İzinli", tone: "info" };
  if (lesson.status === "in_progress") return { label: en ? "In progress" : "Devam ediyor", tone: "info" };
  if (new Date(lesson.endAt).getTime() < Date.now())
    return { label: en ? "Not yet finalized" : "Henüz sonuçlanmadı", tone: "neutral" };
  return { label: en ? "Scheduled" : "Planlandı", tone: "primary" };
}

/**
 * Öğrenci/veli yüzeyi — `lessonStatusBadge` ile aynıdır ("Yoklama bekliyor"
 * zaten hiçbir yüzeyde üretilmiyor). İmza, mevcut çağrı noktalarını kırmamak
 * için korunur.
 */
export function studentFacingLessonStatus(
  lesson: Lesson,
  locale: Locale = getActiveLocale(),
): { label: string; tone: BadgeTone } {
  return lessonStatusBadge(lesson, locale);
}
