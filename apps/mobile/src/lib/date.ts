import type { Locale } from "../i18n/locales";
import { getActiveLocale } from "../i18n/locale-store";

/** Küçük, bağımlılıksız tarih biçimlendirici — gün/ay adları aktif dile göre. */
export function format(date: Date, pattern: "yyyy-MM-dd" | "HH:mm"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (pattern === "yyyy-MM-dd") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const WEEKDAYS: Record<Locale, string[]> = {
  tr: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const MONTHS: Record<Locale, string[]> = {
  tr: [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};
const RELATIVE_DAY: Record<Locale, [string, string, string]> = {
  tr: ["Bugün", "Yarın", "Dün"],
  en: ["Today", "Tomorrow", "Yesterday"],
};

export function weekdayName(date: Date, locale: Locale = getActiveLocale()): string {
  return WEEKDAYS[locale][date.getDay()]!;
}

/** "26 Ağu" / "26 Aug" gibi kısa gün-ay etiketi. */
export function shortDayMonth(date: Date, locale: Locale = getActiveLocale()): string {
  return `${date.getDate()} ${MONTHS[locale][date.getMonth()]!.slice(0, 3)}`;
}

/** Bugün/Yarın/Dün için okunur kısayol, aksi halde "26 Ağu, Çarşamba". */
export function relativeDayLabel(date: Date, now = new Date(), locale: Locale = getActiveLocale()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  const [today, tomorrow, yesterday] = RELATIVE_DAY[locale];
  if (diffDays === 0) return today;
  if (diffDays === 1) return tomorrow;
  if (diffDays === -1) return yesterday;
  return `${shortDayMonth(date, locale)}, ${weekdayName(date, locale)}`;
}

/** Günün başlangıcına (saat 00:00) sabitlenmiş yeni bir Date döner. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Verilen tarihi içeren haftanın Pazartesi'si (TR haftası Pazartesi başlar). */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const mondayOffset = (d.getDay() + 6) % 7; // Pazar=0 → 6, Pazartesi=1 → 0
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

/** `date`'e `days` gün ekler (negatif de olabilir). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** İki tarih aynı takvim gününe mi düşüyor. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Verilen ISO zaman damgası `nowMs`'ten (render sırasında `Date.now()`
 * çağırmak yerine çağıranın ürettiği, dışarıdan geçirilen bir referans
 * zaman) önce mi — "geçmiş/gecikmiş" göstergelerinin ortak kök taşı.
 * `now`'ı NASIL ürettiğine (bkz. `useNow` hook'u) karışmaz, yalnız
 * karşılaştırır — bu yüzden saf ve test edilebilir.
 */
export function isPast(dateIso: string, nowMs: number): boolean {
  return new Date(dateIso).getTime() < nowMs;
}

/** Ay adı (0=Ocak/January). */
export function monthName(monthIndex: number, locale: Locale = getActiveLocale()): string {
  return MONTHS[locale][((monthIndex % 12) + 12) % 12]!;
}

/** "Ekim 2026" / "October 2026" — `month.month` ("2026-10") anahtarından. */
export function monthYearTitle(monthKey: string, locale: Locale = getActiveLocale()): string {
  const [y, m] = monthKey.split("-");
  const name = monthName((Number(m) - 1) % 12, locale);
  return name && y ? `${name} ${y}` : monthKey;
}

/** Para biçimi — aktif dile göre gruplama (₺/TRY tutarı aynen korunur). */
export function formatCurrency(amount: number, locale: Locale = getActiveLocale()): string {
  const tag = locale === "en" ? "en-US" : "tr-TR";
  return new Intl.NumberFormat(tag, { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount);
}
