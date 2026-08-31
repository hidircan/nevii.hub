/** Küçük, bağımlılıksız tarih biçimlendirici — Türkçe gün/ay adları dahil. */
export function format(date: Date, pattern: "yyyy-MM-dd" | "HH:mm"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (pattern === "yyyy-MM-dd") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()]!;
}

/** "26 Ağu" gibi kısa gün-ay etiketi. */
export function shortDayMonth(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]!.slice(0, 3)}`;
}

/** Bugün/Yarın/Dün için okunur kısayol, aksi halde "26 Ağu, Çarşamba". */
export function relativeDayLabel(date: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Yarın";
  if (diffDays === -1) return "Dün";
  return `${shortDayMonth(date)}, ${weekdayName(date)}`;
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

/** Para biçimi — Türkçe yerel ayarlarla (₺). */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount);
}
