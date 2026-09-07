/**
 * ÖNCELİK 4 — Yıllık Yoklama Takvimi: dönem/takvim ay aralığı + gün durumu
 * (statü) çözümleme. Saf fonksiyonlar — I/O yok, store'dan bağımsız test
 * edilebilir (bkz. src/lib/__tests__/attendance-calendar.test.ts).
 *
 * Statü öncelik sırası (KESİN):
 *   1) Manuel admin istisnası (ClosedDay — kapalı VEYA zorla açık)
 *   2) Resmî tatil (turkishOfficialHolidays)
 *   3) Dönemin haftalık kapalı gün kuralı (Güz: Pazartesi; Yaz: Cts/Paz)
 *   4) Açık gün
 */

import type { ClosedDay, Lesson, StudentTermType } from "./types";
import { findOfficialHoliday } from "./turkish-holidays";
import { toYmd } from "./closed-days";

export type DayStatus = "closed" | "open";

export type DayStatusReason =
  | "manual_closed"
  | "manual_open"
  | "official_holiday"
  | "term_weekly_closed"
  | "open";

export type DayStatusResolution = {
  date: string; // yyyy-MM-dd
  status: DayStatus;
  reason: DayStatusReason;
  label: string;
};

/** Güz dönemi: haftanın Pazartesi günü (1) varsayılan kapalı. */
export const FALL_WEEKLY_CLOSED_DAYS: number[] = [1];
/** Yaz dönemi: Cumartesi(6) + Pazar(0) varsayılan kapalı. */
export const SUMMER_WEEKLY_CLOSED_DAYS: number[] = [0, 6];

/** Paket 6 — okulun `SchoolSettings.termWeeklyClosedDays` özelleştirmesi; verilmezse sabit varsayılanlar kullanılır. */
export type TermWeeklyClosedDaysOverride = { guz: number[]; yaz: number[] };

export function weeklyClosedDaysForTerm(
  term: StudentTermType,
  override?: TermWeeklyClosedDaysOverride
): number[] {
  if (override) return term === "yaz" ? override.yaz : override.guz;
  return term === "yaz" ? SUMMER_WEEKLY_CLOSED_DAYS : FALL_WEEKLY_CLOSED_DAYS;
}

/**
 * ÖNCELİK 4 (devam) — Program ekranı dönem-bazlı gün kapatma. `term`
 * verilmezse LEGACY davranış korunur: yalnızca Pazartesi kapalı (mevcut
 * `SCHOOL_CLOSED_WEEKDAY`/`isMonday` kuralı, dönem kavramı eklenmeden önceki
 * tüm ders oluşturma/taşıma akışlarıyla birebir aynı sonucu üretir).
 */
export function isWeeklyClosedDayForTerm(
  date: Date,
  term?: StudentTermType,
  override?: TermWeeklyClosedDaysOverride
): boolean {
  if (!term) return date.getDay() === 1; // legacy: yalnızca Pazartesi
  return weeklyClosedDaysForTerm(term, override).includes(date.getDay());
}

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

/**
 * Bir günün nihai statüsünü — manuel istisna > resmî tatil > dönem haftalık
 * kuralı > açık — sırasıyla çözer.
 */
export function resolveDayStatus(
  date: Date,
  term: StudentTermType,
  manualOverrides: Pick<ClosedDay, "date" | "isOpen" | "name">[],
  weeklyClosedDaysOverride?: TermWeeklyClosedDaysOverride
): DayStatusResolution {
  const ymd = toYmd(date);

  // 1) Manuel admin istisnası — en yüksek öncelik.
  const manual = manualOverrides.find((o) => o.date === ymd);
  if (manual) {
    return manual.isOpen
      ? { date: ymd, status: "open", reason: "manual_open", label: manual.name || "Zorla açık" }
      : { date: ymd, status: "closed", reason: "manual_closed", label: manual.name || "Kapalı (yönetici)" };
  }

  // 2) Resmî tatil.
  const holiday = findOfficialHoliday(ymd);
  if (holiday) {
    return { date: ymd, status: "closed", reason: "official_holiday", label: holiday.name };
  }

  // 3) Dönemin haftalık kapalı gün kuralı.
  const weekday = date.getDay(); // 0=Pazar..6=Cumartesi
  if (weeklyClosedDaysForTerm(term, weeklyClosedDaysOverride).includes(weekday)) {
    const label = term === "yaz" ? "Hafta sonu (Yaz dönemi kapalı)" : "Pazartesi (Güz dönemi kapalı)";
    return { date: ymd, status: "closed", reason: "term_weekly_closed", label };
  }

  // 4) Açık gün.
  return { date: ymd, status: "open", reason: "open", label: "Açık" };
}

/** Tüm ay için gün gün statü listesi üretir (UI ay kutusu render'ı için). */
export function resolveMonthStatuses(
  year: number,
  month: number, // 1-12
  term: StudentTermType,
  manualOverrides: Pick<ClosedDay, "date" | "isOpen" | "name">[],
  weeklyClosedDaysOverride?: TermWeeklyClosedDaysOverride
): DayStatusResolution[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const results: DayStatusResolution[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d, 12, 0, 0);
    results.push(resolveDayStatus(date, term, manualOverrides, weeklyClosedDaysOverride));
  }
  return results;
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
  makeup: "#ca8a04", // yellow-600 — Telafi
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
  lessons: Array<{ lessonId: string; opsStatus: "attended" | "processed" | "makeup" | "cancelled" | "planned" | "absent" | "excused" | null }>
): AttendanceCalendarColorKey[] {
  if (dayStatus === "closed") return ["closed"];
  if (lessons.length === 0) return ["open"];
  const perLesson = lessons.map((l): AttendanceCalendarColorKey =>
    l.opsStatus === "attended" || l.opsStatus === "processed" || l.opsStatus === "makeup" || l.opsStatus === "cancelled"
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
