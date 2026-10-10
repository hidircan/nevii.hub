/**
 * ÖNCELİK 4 — Yıllık Yoklama Takvimi: dönem/takvim ay aralığı + gün durumu
 * (statü) çözümleme. Saf fonksiyonlar — I/O yok, store'dan bağımsız test
 * edilebilir (bkz. src/lib/__tests__/attendance-calendar.test.ts).
 *
 * Statü öncelik sırası artık burada DEĞİL, `src/lib/work-days.ts` içinde
 * tek kaynak olarak tanımlıdır (yönetici istisnası > resmî tatil > dönem
 * haftalık kuralı > açık).
 */

import type { Lesson, StudentTermType } from "./types";

/**
 * TEK KAYNAK (2026-09-20): gün açık/kapalı çözümlemesi artık
 * `src/lib/work-days.ts` içindedir — Ders Programı, seri planlama, ödeme
 * önizlemesi, yoklama ve ders oluşturma doğrulaması AYNI fonksiyonu kullanır.
 * Buradaki re-export'lar yalnız geriye dönük uyumluluk içindir; YENİ kod
 * doğrudan `@/lib/work-days`'ten import etmelidir.
 */
export {
  FALL_WEEKLY_CLOSED_DAYS,
  SUMMER_WEEKLY_CLOSED_DAYS,
  weeklyClosedDaysForTerm,
  isWeeklyClosedDayForTerm,
  resolveDayStatus,
  resolveMonthStatuses,
} from "./work-days";
export type {
  DayStatus,
  DayStatusReason,
  DayStatusResolution,
  TermWeeklyClosedDaysOverride,
} from "./work-days";

import type { DayStatus } from "./work-days";

/**
 * Bir dönemin varsayılan takvim ay aralığı (yıl bağımsız, ay indeksleri
 * 1–12). Güz: Eylül(9)–Haziran(6, bir sonraki takvim yılına taşar).
 * Yaz: Temmuz(7)–Ağustos(8) + opsiyonel uzatma (Eylülün 2. haftasına kadar).
 */
export type TermMonth = { year: number; month: number }; // month: 1-12

/**
 * Bugünün tarihine göre "içinde bulunulan" akademik yıl-çapası. Sunucu
 * bileşenlerinden (RSC) de çağrılabilmesi için burada — "use client" olan
 * `attendance-calendar-panel.tsx` bunu re-export eder, kendi kopyasını TUTMAZ.
 *
 * Düzeltme (Temmuz/Ağustos boşluğu — "yoklama takviminde veri gelmiyor"):
 * eskiden yalnızca Eylül (ay indeksi 8) ve sonrası "bu yılın" çapasını
 * (bu Eylül – gelecek Haziran) alırdı; Temmuz/Ağustos (indeks 6-7) hâlâ
 * ÖNCEKİ yılın çapasına (geçen Eylül – bu Haziran, ki bu ZATEN BİTMİŞTİR)
 * düşüyordu. Sonuç: Temmuz/Ağustos ayında Güz dönemli bir öğrenci için
 * takvim, güncel/yaklaşan hiçbir ders içermeyen, çoktan kapanmış bir
 * aralığı varsayılan gösteriyordu — o dersler her zaman var olmasına
 * rağmen ekranda hiç görünmüyordu. Eşik artık Temmuz (indeks 6) —
 * Temmuz'dan itibaren yaklaşan (bu Eylül'den başlayan) çapa gösterilir.
 */
export function currentAcademicAnchorYear(term: StudentTermType): number {
  const now = new Date();
  return term === "yaz" ? now.getFullYear() : now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * @param anchorYear Güz için "başlangıç" takvim yılı (ör. 2026 -> Eylül 2026–
 *   Haziran 2027). Yaz için o yazın takvim yılı.
 * @param summerExtensionEndDay Yaz döneminde Eylül ayına uzatılan gün sayısı
 *   (1–14 arası, "Eylülün ikinci haftasına kadar" kısıtı — varsayılan 0).
 */
export function termMonths(
  term: StudentTermType,
  anchorYear: number,
  summerExtensionEndDay = 0
): TermMonth[] {
  if (term === "yaz") {
    const months: TermMonth[] = [
      { year: anchorYear, month: 7 },
      { year: anchorYear, month: 8 },
    ];
    if (summerExtensionEndDay > 0) {
      months.push({ year: anchorYear, month: 9 });
    }
    return months;
  }
  // guz: Eylül(anchorYear) .. Haziran(anchorYear+1)
  const months: TermMonth[] = [];
  for (let m = 9; m <= 12; m++) months.push({ year: anchorYear, month: m });
  for (let m = 1; m <= 6; m++) months.push({ year: anchorYear + 1, month: m });
  return months;
}

/** Yaz uzatma sınırı: Eylülün en fazla 14. gününe kadar (2. hafta sonu). */
export const MAX_SUMMER_EXTENSION_DAY = 14;

export function clampSummerExtensionDay(day: number): number {
  if (!Number.isFinite(day) || day <= 0) return 0;
  return Math.min(Math.round(day), MAX_SUMMER_EXTENSION_DAY);
}

/**
 * Bir tarihin dönem takvimi içinde "geçerli" olup olmadığını (yaz uzatmasının
 * Eylül ayında sınırını aşıp aşmadığını) kontrol eder. Güz'de her zaman true
 * (tüm ay geçerli); Yaz'da Eylül ayı yalnızca uzatma gününe kadar geçerlidir.
 */
export function isDateWithinTermCalendar(
  dateYmd: string,
  term: StudentTermType,
  summerExtensionEndDay = 0
): boolean {
  if (term !== "yaz") return true;
  const day = Number(dateYmd.slice(8, 10));
  const month = Number(dateYmd.slice(5, 7));
  if (month !== 9) return true; // Temmuz/Ağustos her zaman geçerli
  const ext = clampSummerExtensionDay(summerExtensionEndDay);
  return ext > 0 && day <= ext;
}

export type LessonAcademicPeriod = { term: StudentTermType; academicYearStart: number; source: "explicit" | "legacy_fallback" };

/**
 * ÖNCELİK 4 (devam) — Program ekranı akademik dönem/yıl özelliği. Bir dersin
 * "hangi dönem/akademik yıla ait" olduğunu çözer:
 *   1) Ders (veya seri) üzerinde `term`/`academicYearStart` AÇIKÇA set
 *      edilmişse (bu alan eklendikten SONRA oluşturulan kayıtlar) o kullanılır.
 *   2) Yoksa (legacy kayıt — alan eklenmeden önce oluşturuldu, veri kaybı
 *      olmadan NULL bırakıldı) dersin `startAt` tarihinden, öğrencinin
 *      `termType`'ına göre en olası dönem/yıl GÜVENLİ FALLBACK ile türetilir
 *      (Temmuz–Ağustos(–uzatma Eylül) → Yaz; aksi halde Güz). Bu, mevcut
 *      Yoklama Takvimi'nin geçmiş kayıtları göstermeye devam etmesini garanti
 *      eder — hiçbir ders "kayıp" görünmez.
 */
export function resolveLessonAcademicPeriod(
  lesson: Pick<Lesson, "startAt" | "term" | "academicYearStart">,
  studentTermFallback: StudentTermType = "guz"
): LessonAcademicPeriod {
  if (lesson.term && typeof lesson.academicYearStart === "number") {
    return { term: lesson.term, academicYearStart: lesson.academicYearStart, source: "explicit" };
  }
  const d = new Date(lesson.startAt);
  const month = d.getMonth() + 1; // 1-12
  if (month === 7 || month === 8 || month === 9) {
    // Temmuz/Ağustos/Eylül başı — öğrencinin kayıtlı dönemi Yaz ise Yaz say,
    // değilse (Güz öğrencisi için Eylül zaten Güz başlangıcıdır) Güz say.
    if (studentTermFallback === "yaz" || month !== 9) {
      return { term: "yaz", academicYearStart: d.getFullYear(), source: "legacy_fallback" };
    }
  }
  const academicYearStart = month >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  return { term: "guz", academicYearStart, source: "legacy_fallback" };
}

/**
 * Bir dersin, verilen (dönem, akademik-yıl-çapası) ile eşleşip eşleşmediğini
 * söyler — legacy kayıtlar fallback üzerinden dahil edilir, asla sessizce
 * dışlanmaz (bkz. resolveLessonAcademicPeriod dokümantasyonu).
 */
export function lessonMatchesAcademicPeriod(
  lesson: Pick<Lesson, "startAt" | "term" | "academicYearStart">,
  term: StudentTermType,
  academicYearStart: number,
  studentTermFallback: StudentTermType = "guz"
): boolean {
  const resolved = resolveLessonAcademicPeriod(lesson, studentTermFallback);
  return resolved.term === term && resolved.academicYearStart === academicYearStart;
}

/**
 * TEK renk kaynağı — takvim gün kutusu (dolgu), yoklama aksiyon butonları ve
 * rozetler bu sözlükten türetilmelidir; hiçbir ekranda ayrıca hard-coded hex
 * yazılmaz. Anahtarlar `LessonOpsFlag` (`src/lib/lesson-ops.ts`) ile birebir
 * aynı: "attended"=Geldi, "processed"=İşlendi, "makeup"=Telafi. Ayrıca
 * "closed" (kapalı gün) ve "planned"/"open" (ders var ama statü yok / hiç
 * ders yok) durumları.
 */
/**
 * P0 (2026-09-05) — owner talimatıyla İşlendi/Telafi renkleri YER DEĞİŞTİRDİ:
 * artık İşlendi=KIRMIZI, Telafi=SARI (Geldi=yeşil değişmedi). Bu, 2026-09-02
 * tarihli P0-2E kararının bilinçli olarak tersine çevrilmesidir — sözlük TEK
 * kaynak olduğu için takvim, program ızgarası, rozetler ve lejantlar bu
 * değişikliği otomatik alır. Mazeretli mor/nötr tonda KALDI.
 */
/**
 * P0 UAT (2026-09-07) — DOLGU TONLARI ÖLÇÜLEN KONTRASTA GÖRE AYARLANDI.
 * Statü→renk EŞLEMESİ (owner kararı: Geldi=yeşil, İşlendi=KIRMIZI,
 * Telafi=SARI, İptal=koyu gri, Planlandı=nötr) DEĞİŞMEDİ; yalnızca
 * `attended` green-600→green-700 ve `processed` red-600→red-700 oldu, çünkü
 * eski tonlar üzerindeki 10–13 px kart/gün metni WCAG AA'yı (4.5:1)
 * geçmiyordu (ölçüm: green-600 + beyaz = 3.30:1, red-600 + beyaz = 4.41:1).
 * Eşiği `attendance-calendar-colors.test.ts` HESAPLAYARAK doğrular — bu
 * yorum bir iddia değil, testin kontrol ettiği bir olgudur.
 */
export const ATTENDANCE_CALENDAR_COLORS = {
  attended: "#15803d", // green-700 — Geldi/tamamlandı
  processed: "#b91c1c", // red-700 — İşlendi
  makeup: "#ca8a04", // yellow-600 — Telafi (kaçırılan, telafiye alınan ders)
  makeup_planned: "#e5fb57", // slate-600 — Planlanan telafi (Telafi Merkezi'nden planlanan ders)
  cancelled: "#475569", // slate-600 — İptal
  absent: "#57534e", // stone-600 — Gelmedi (mazeretsiz)
  excused: "#7c3aed", // violet-600 — Mazeretli
  closed: "#0a0a0a", // near-black — Kapalı
  planned: "#93c5fd", // blue-300 — planlı dersi var, statü henüz girilmemiş
  open: "#e5e7eb", // gray-200 — Açık, ders yok/işaretsiz
} as const;

/** Dolgu üstünde kullanılabilecek iki metin rengi — üçüncü bir ton İCAT EDİLMEZ. */
export const ON_FILL_LIGHT = "#ffffff";
export const ON_FILL_DARK = "#1c1503";

/** WCAG 2.x bağıl parlaklık (relative luminance). `#rrggbb` bekler. */
export function relativeLuminance(hex: string): number {
  const v = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG 2.x kontrast oranı (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export type AttendanceCalendarColorKey = keyof typeof ATTENDANCE_CALENDAR_COLORS;

/**
 * Ay grid'inin Pazartesi→Pazar sütun sırasıyla hizalanması için: `Date.getDay()`
 * Pazar=0 tabanlıdır, burada Pazartesi=0..Pazar=6'ya çevrilir. Kapalı gün
 * kuralını (Pazartesi/hafta sonu) ETKİLEMEZ — yalnızca UI grid pozisyonu.
 */
export function mondayFirstWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Ayın 1. günü grid'de kaçıncı sütunda (Pazartesi=0) başlıyor — o kadar boş hücre eklenir. */
export function leadingBlankDayCount(year: number, month: number): number {
  return mondayFirstWeekdayIndex(new Date(year, month - 1, 1, 12, 0, 0));
}

/** Son haftayı da 7 sütuna tamamlamak için gereken boş hücre sayısı. */
export function trailingBlankDayCount(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  const used = (leadingBlankDayCount(year, month) + daysInMonth) % 7;
  return used === 0 ? 0 : 7 - used;
}

/**
 * URL/body'den gelen `studentId`'nin tenant-scoped öğrenci listesinde olup
 * olmadığını doğrular — yoksa `null` döner (takvim render edilmez, seçici
 * gösterilir). Tek gerçek kaynak `scopedStudentIds` (server tarafında
 * `readScopedData`/tenant filtresinden üretilir); bu fonksiyon başka hiçbir
 * yerden veri okumaz.
 */
export function resolveAttendanceCalendarStudentId(
  requestedStudentId: string | null | undefined,
  scopedStudentIds: string[]
): string | null {
  if (!requestedStudentId) return null;
  return scopedStudentIds.includes(requestedStudentId) ? requestedStudentId : null;
}

/**
 * Dolgu üzerindeki metin rengi — artık SABİT bir "sarıysa koyu, değilse beyaz"
 * kuralı DEĞİL, ölçülen kontrasta göre seçim. Eski kural üç gerçek erişilebilirlik
 * hatası bırakıyordu: `planned` (#93c5fd) üzerinde beyaz metin 1.81:1,
 * `open` (#e5e7eb) üzerinde 1.26:1 — yani açık mavi/gri gün kutularındaki gün
 * numarası pratikte görünmüyordu. Hesaplama her iki temada da AYNIDIR: dolgu
 * rengi temaya göre değişmez, bu yüzden koyu/açık modda ayrı bir kural gerekmez.
 */
export function attendanceCalendarTextColor(key: AttendanceCalendarColorKey): typeof ON_FILL_LIGHT | typeof ON_FILL_DARK {
  return onFillTextColor(ATTENDANCE_CALENDAR_COLORS[key]);
}

/** Verilen dolgu için beyaz/koyu'dan kontrastı YÜKSEK olanı döndürür. */
export function onFillTextColor(fill: string): typeof ON_FILL_LIGHT | typeof ON_FILL_DARK {
  return contrastRatio(fill, ON_FILL_LIGHT) >= contrastRatio(fill, ON_FILL_DARK) ? ON_FILL_LIGHT : ON_FILL_DARK;
}

/**
 * TEK KAYNAK — Ders Programı ızgarasındaki/gün listesindeki ders KARTININ ve
 * Yoklama Takvimi gün kutusunun dolgusu aynı sözlükten gelir. `planned`
 * (statü girilmemiş) kart için NÖTR'dür: tema yüzeyi kullanılır, saydırma
 * yapılmaz — böylece "renk yoksa" güvenli bir geri düşüş vardır.
 *
 * Kapsanmayan/gelecekte eklenecek bir statü de aynı nötr yüzeye düşer
 * (`?? null`), asla renksiz/okunamaz bir kart üretmez.
 */
export type LessonCardFillStyle = { backgroundColor: string; color: string };

const LESSON_CARD_FILL_KEYS = {
  attended: "attended",
  processed: "processed",
  makeup: "makeup",
  makeup_planned: "makeup_planned",
  cancelled: "cancelled",
  absent: "absent",
  excused: "excused",
} as const satisfies Record<string, AttendanceCalendarColorKey>;

export function lessonCardFillStyle(status: string): LessonCardFillStyle {
  const key = (LESSON_CARD_FILL_KEYS as Record<string, AttendanceCalendarColorKey | undefined>)[status];
  if (!key) {
    // Nötr geri düşüş — "Planlandı" ve bilinmeyen her statü.
    return { backgroundColor: "var(--color-surface)", color: "var(--color-text)" };
  }
  const fill = ATTENDANCE_CALENDAR_COLORS[key];
  return { backgroundColor: fill, color: onFillTextColor(fill) };
}

/** Nötr (Planlandı) kartta ikincil satırların rengi — dolgulu kartta ana metinle aynı ton kullanılır. */
export function lessonCardMutedTextColor(status: string): string {
  return (LESSON_CARD_FILL_KEYS as Record<string, AttendanceCalendarColorKey | undefined>)[status]
    ? lessonCardFillStyle(status).color
    : "var(--color-text-muted)";
}

/**
 * Bir günün TAKVİM KUTUSU dolgusu için gösterilecek renk anahtarı segmentleri
 * — TEK kaynak, UI'da ayrıca tahmin/hard-code EDİLMEZ. Öncelik sırası:
 *   1) Kapalı gün → tek segment "closed" (statü hiç yazılamaz, en yüksek öncelik).
 *   2) Hiç ders yoksa → tek segment "open".
 *   3) Dersler varsa → HER DERSİN KENDİ nihai ders statüsü kendi
 *      segmentinde gösterilir (statüsüz ders "planned" rengiyle), sırasıyla
 *      lessonIds sırasında — böylece çoklu-dersli bir günde tek bir ders
 *      diğerini GİZLEMEZ, veri kaybı olmaz. Tek ders varsa (veya tüm
 *      dersler aynı statüdeyse) tek segment döner; UI bunu düz dolgu,
 *      birden fazla FARKLI segment varsa eşit parçalı (çizgili) dolgu olarak
 *      render eder.
 */
export function resolveDayFillSegments(
  dayStatus: DayStatus,
  lessons: Array<{ lessonId: string; opsStatus: "attended" | "processed" | "makeup" | "makeup_planned" | "cancelled" | "planned" | "absent" | "excused" | null }>
): AttendanceCalendarColorKey[] {
  if (dayStatus === "closed") return ["closed"];
  if (lessons.length === 0) return ["open"];
  const perLesson = lessons.map((l): AttendanceCalendarColorKey =>
    l.opsStatus === "attended" ||
    l.opsStatus === "processed" ||
    l.opsStatus === "makeup" ||
    l.opsStatus === "makeup_planned" ||
    l.opsStatus === "cancelled"
      ? l.opsStatus
      : "planned"
  );
  const distinct = Array.from(new Set(perLesson));
  return distinct.length === 1 ? [distinct[0]!] : perLesson;
}

/**
 * Yoklama Takvimi'nin GÖSTERDİĞİ ay listesi — TEK kaynak. `termMonths`'tan
 * farkı: yaz döneminde Eylül her zaman listelenir (uzatma günü olmasa bile
 * ay kutusu render edilir, "dönem dışı" bilgisi ayın `withinTerm` alanında
 * taşınır). Bu, `attendance-calendar-panel.tsx`'teki `termMonthList` ile
 * BİREBİR aynı listedir; dönem uç noktası (`getAttendanceCalendarTermTool`)
 * ile istemcinin beklediği kutu sayısı ayrışmasın diye buraya taşındı.
 */
export function attendanceCalendarTermMonths(term: StudentTermType, anchorYear: number): TermMonth[] {
  if (term === "yaz") {
    return [
      { year: anchorYear, month: 7 },
      { year: anchorYear, month: 8 },
      { year: anchorYear, month: 9 },
    ];
  }
  const months: TermMonth[] = [];
  for (let m = 9; m <= 12; m++) months.push({ year: anchorYear, month: m });
  for (let m = 1; m <= 6; m++) months.push({ year: anchorYear + 1, month: m });
  return months;
}

/**
 * UAT 2026-09-25 — Yoklama Takvimi öğrenci seçicisi yalnız AKTİF (silinmemiş) öğrencileri önerir.
 * Pasif öğrencinin kayıtları silinmez: `?studentId=` ile doğrudan açılırsa takvimi görünür ve
 * seçicide "(pasif)" etiketiyle tek istisna olarak listelenir (yeni seçim için önerilmez).
 */
export function attendancePickerStudents<T extends { id: string; name: string; active?: boolean; deletedAt?: string }>(
  students: T[],
  selectedId: string | null
): { student: T; inactive: boolean }[] {
  return [...students]
    .filter((s) => !s.deletedAt && (s.active !== false || s.id === selectedId))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
    .map((s) => ({ student: s, inactive: s.active === false }));
}
