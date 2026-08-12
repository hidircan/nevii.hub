import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  format,
  parseISO,
  isSameDay,
  addDays,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from "date-fns";
import { tr } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string, pattern = "d MMM yyyy") {
  return format(parseISO(iso), pattern, { locale: tr });
}

/** Türkçe okunur tarih+saat — örn. "12 Ağustos 2026, 18:35". */
export function formatDateTime(iso: string) {
  return format(parseISO(iso), "d MMMM yyyy, HH:mm", { locale: tr });
}

/** Ödeme kaynağı — kullanıcıya görünen kısa etiket. */
export function paymentSourceLabel(source: string | undefined, hasLessonId?: boolean): string | null {
  if (source === "lesson_ops" || (!source && hasLessonId)) return "Yoklama takviminden tahsil edildi";
  if (source === "monthly_plan") return "Aylık plan tahsilatı";
  if (source === "manual") return "Manuel kayıt";
  return null;
}

export function formatTime(iso: string) {
  return format(parseISO(iso), "HH:mm", { locale: tr });
}

/** "voided" (ders iptaliyle geri alınmış otomatik tahsilat) asla bekleyen/borç sayılmaz — "paid" da değildir ama açık borç da değildir. */
export function isOutstandingPaymentStatus(status: string): boolean {
  return status !== "paid" && status !== "voided";
}

export function formatMoney(amount: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Doğum tarihinden bugüne göre yaş — saf fonksiyon, saat dilimi kaymasına karşı yerel gün kullanır. */
export function computeAge(birthDateIso: string, now: Date = new Date()): number {
  const birth = new Date(birthDateIso);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function dayName(dayOfWeek: number) {
  const names = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  return names[dayOfWeek] ?? "";
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    present: "Geldi",
    absent: "Gelmedi",
    late: "Geç kaldı",
    cancelled_by_school: "Okul iptal",
    pending: "Bekliyor",
    suggested: "Slot önerildi",
    awaiting_info: "Bilgi bekleniyor",
    confirmed: "Onaylandı",
    completed: "Tamamlandı",
    expired: "Süresi doldu",
    cancelled: "İptal",
    paid: "Ödendi",
    overdue: "Gecikmiş",
    partial: "Kısmi",
    voided: "İptal edildi",
    scheduled: "Planlandı",
    no_show: "Gelmedi",
    regular: "Normal",
    makeup: "Telafi",
    trial: "Deneme",
    group: "Grup",
    draft: "Taslak",
    approved: "Onaylandı",
    sent: "Gönderildi",
    replied: "Yanıt geldi",
    lost: "Sonuçsuz",
    published: "Yayında",
    archived: "Arşivlendi",
    in_progress: "Devam ediyor",
    delayed: "Başlamadı",
    rejected: "Reddedildi",
    printed: "Yazdırıldı",
    sent_for_signature: "İmzaya verildi",
    signed: "İmzalandı",
    uploaded: "Yüklendi",
  };
  return map[status] ?? status;
}

export function statusColor(status: string) {
  const map: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-800",
    completed: "bg-emerald-100 text-emerald-800",
    paid: "bg-emerald-100 text-emerald-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    absent: "bg-rose-100 text-rose-800",
    no_show: "bg-rose-100 text-rose-800",
    overdue: "bg-rose-100 text-rose-800",
    expired: "bg-rose-100 text-rose-800",
    cancelled: "bg-slate-100 text-slate-600",
    cancelled_by_school: "bg-slate-100 text-slate-600",
    pending: "bg-amber-100 text-amber-800",
    suggested: "bg-sky-100 text-sky-800",
    awaiting_info: "bg-orange-100 text-orange-800",
    partial: "bg-amber-100 text-amber-800",
    voided: "bg-stone-200 text-stone-600",
    late: "bg-orange-100 text-orange-800",
    scheduled: "bg-indigo-100 text-indigo-800",
    /* Telafi her yerde kırmızı — LessonOpsBadges ile aynı anlam/renk dili. */
    makeup: "bg-rose-100 text-rose-800",
    draft: "bg-slate-100 text-slate-600",
    approved: "bg-sky-100 text-sky-800",
    sent: "bg-indigo-100 text-indigo-800",
    replied: "bg-sky-100 text-sky-800",
    lost: "bg-slate-200 text-slate-600",
    published: "bg-emerald-100 text-emerald-800",
    archived: "bg-slate-200 text-slate-600",
    in_progress: "bg-cyan-100 text-cyan-800",
    delayed: "bg-orange-100 text-orange-800",
    rejected: "bg-rose-100 text-rose-800",
    printed: "bg-sky-100 text-sky-800",
    sent_for_signature: "bg-amber-100 text-amber-800",
    signed: "bg-emerald-100 text-emerald-800",
    uploaded: "bg-emerald-100 text-emerald-800",
  };
  return map[status] ?? "bg-slate-100 text-slate-700";
}

export { isSameDay, addDays, startOfWeek, endOfWeek, isWithinInterval, parseISO, format };
