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

/** Öğrencinin GERÇEK, planlı derslerinden (iptal/silinmiş hariç) tekil gün+saat kombinasyonlarını çıkarır. */
export function deriveLessonScheduleTextFromLessons(
  lessons: { startAt: string; status?: string }[]
): string {
  const seen = new Map<string, LessonScheduleSlot>();
  for (const l of lessons) {
    if (l.status === "cancelled") continue;
    const d = new Date(l.startAt);
    if (Number.isNaN(d.getTime())) continue;
    const weekday = d.getUTCDay();
    const time = d.toISOString().slice(11, 16);
    seen.set(`${weekday}_${time}`, { weekday, time });
  }
  return composeLessonScheduleText([...seen.values()]);
}
