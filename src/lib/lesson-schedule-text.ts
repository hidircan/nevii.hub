import { DEFAULT_APP_TIMEZONE, zonedHm, zonedWeekday } from "./timezone";

/**
 * Sözleşme ekranındaki "Ders günü/saati" metninin TEK biçimlendirme kaynağı
 * (bkz. lesson-schedule-slots-picker.tsx composeText/parseSlots ile aynı
 * biçim: "Salı 15:00, Perşembe 16:00"). Kayıt sırasında öğrenci için zaten
 * gerçek ders kayıtları (Lesson.startAt) oluşmuş oluyor — kullanıcı bunu
 * sözleşme ekranında SIFIRDAN tekrar girmek zorunda kalmasın diye, mevcut
 * derslerden aynı metin server tarafında ÖNCEDEN üretilip forma prefill
 * olarak verilir (bkz. sozlesmeler/page.tsx). Alan yine de düzenlenebilir
 * kalır — bu yalnızca varsayılan değer, zorunlu kılınmaz.
 */
export const LESSON_SCHEDULE_WEEKDAY_LABELS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

export type LessonScheduleSlot = { weekday: number; time: string };

/** Görüntüleme sırası Pazartesi'den başlar (Türkiye takvim geleneği) — dahili değer hâlâ 0=Pazar..6=Cumartesi. */
export const LESSON_SCHEDULE_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function composeLessonScheduleText(slots: LessonScheduleSlot[]): string {
  return [...slots]
    .sort(
      (a, b) =>
        LESSON_SCHEDULE_DISPLAY_ORDER.indexOf(a.weekday) - LESSON_SCHEDULE_DISPLAY_ORDER.indexOf(b.weekday) ||
        a.time.localeCompare(b.time)
    )
    .map((s) => `${LESSON_SCHEDULE_WEEKDAY_LABELS[s.weekday]} ${s.time}`)
    .join(", ");
}

/**
 * "Salı 15:00, Perşembe 16:00" → slot listesi. TEK ayrıştırıcı — hem
 * `LessonScheduleSlotsPicker` hem kayıt formu (ders günlerini türetmek için)
 * bunu kullanır; iki yerde iki ayrı regex bırakılmaz.
 */
export function parseLessonScheduleText(text: string): LessonScheduleSlot[] {
  if (!text.trim()) return [];
  const byLabel = new Map(LESSON_SCHEDULE_WEEKDAY_LABELS.map((label, idx) => [label.toLocaleLowerCase("tr-TR"), idx]));
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(\S+)\s+(\d{1,2}:\d{2})$/.exec(part);
      if (!m) return null;
      const weekday = byLabel.get(m[1]!.toLocaleLowerCase("tr-TR"));
      if (weekday === undefined) return null;
      return { weekday, time: m[2]! };
    })
    .filter((s): s is LessonScheduleSlot => s !== null);
}

/** Metinden yalnız haftanın günleri (0=Pazar..6=Cumartesi), tekilleştirilmiş ve sıralı. */
export function lessonWeekdaysFromText(text: string): number[] {
  return Array.from(new Set(parseLessonScheduleText(text).map((s) => s.weekday))).sort((a, b) => a - b);
}

/**
 * Öğrencinin GERÇEK, planlı derslerinden (iptal/silinmiş hariç) tekil gün+saat
 * kombinasyonlarını çıkarır.
 *
 * 2026-09-20 KÖK NEDEN DÜZELTMESİ: gün/saat `getUTCDay()` + `toISOString()`
 * ile okunuyordu. `startAt` UTC'de saklandığı için İstanbul'da 15:00 olan bir
 * ders sözleşme ekranında "12:00" olarak ön-doluyordu — ve gece yarısına
 * yakın dersler bir ÖNCEKİ güne kayıyordu (bkz. LESSONS_LEARNED 2026-09-09).
 * Artık kurum saat diliminden okunur.
 */
export function deriveLessonScheduleTextFromLessons(
  lessons: { startAt: string; status?: string }[]
): string {
  const seen = new Map<string, LessonScheduleSlot>();
  for (const l of lessons) {
    if (l.status === "cancelled") continue;
    const d = new Date(l.startAt);
    if (Number.isNaN(d.getTime())) continue;
    const weekday = zonedWeekday(d, DEFAULT_APP_TIMEZONE);
    const time = zonedHm(d, DEFAULT_APP_TIMEZONE);
    seen.set(`${weekday}_${time}`, { weekday, time });
  }
  return composeLessonScheduleText([...seen.values()]);
}
