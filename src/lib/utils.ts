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
import { toWallClockDate } from "./timezone";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Görünen tarih/saat HER ZAMAN kurum saat diliminde (sunucu UTC'de de) — bkz. toWallClockDate.
export function formatDate(iso: string, pattern = "d MMM yyyy") {
  return format(toWallClockDate(parseISO(iso)), pattern, { locale: tr });
}

/** Türkçe okunur tarih+saat — örn. "12 Ağustos 2026, 18:35". */
export function formatDateTime(iso: string) {
  return format(toWallClockDate(parseISO(iso)), "d MMMM yyyy, HH:mm", { locale: tr });
}


/** Merkezi ödeme yöntemi → Türkçe etiket (UI'da enum sızmasın). */
export function paymentMethodLabelTr(method: string | undefined | null): string {
  if (!method) return "—";
  const key = method.trim().toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    cash: "Nakit",
    nakit: "Nakit",
    transfer: "Havale / EFT",
    havale: "Havale / EFT",
    "havale/eft": "Havale / EFT",
    eft: "Havale / EFT",
    credit_card: "Kredi Kartı",
    creditcard: "Kredi Kartı",
    "kredi_kartı": "Kredi Kartı",
    "kredi kartı": "Kredi Kartı",
    card: "Kredi Kartı",
  };
  return map[key] ?? method;
}

/** API/store'a yazılacak kanonik yöntem enum'u. */
export function normalizePaymentMethodEnum(
  method: string | undefined | null
): "cash" | "transfer" | "credit_card" | undefined {
  if (!method) return undefined;
  const key = method.trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "cash" || key === "nakit") return "cash";
  if (key === "transfer" || key === "havale" || key === "havale/eft" || key === "eft") return "transfer";
  if (
    key === "credit_card" ||
    key === "creditcard" ||
    key === "kredi_kartı" ||
    key === "kredi_karti" ||
    key === "card"
  ) {
    return "credit_card";
  }
  return undefined;
}

/**
 * Ödeme detay cümlesi — yalnız paidAt (fiili tahsil anı).
 * Örn. "13 Ağustos 2026, 14:12 tarihinde Ayşe tarafından 2.500 TL Havale / EFT olarak tahsil edildi."
 */
export function formatPaymentCollectionSummary(input: {
  paidAt?: string;
  amount: number;
  method?: string;
  collectorName?: string | null;
}): string | null {
  if (!input.paidAt) return null;
  const when = formatDateTime(input.paidAt);
  const who = input.collectorName?.trim() || "Kayıtlı değil";
  const how = paymentMethodLabelTr(input.method);
  const money = formatMoney(input.amount);
  return `${when} tarihinde ${who} tarafından ${money} ${how} olarak tahsil edildi.`;
}

export function formatTime(iso: string) {
  return format(toWallClockDate(parseISO(iso)), "HH:mm", { locale: tr });
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
    suggested: "Saat önerildi",
    awaiting_info: "Bilgi bekleniyor",
    confirmed: "Onaylandı",
    completed: "Tamamlandı",
    expired: "Süresi doldu",
    cancelled: "İptal",
    paid: "Ödendi",
    overdue: "Gecikmiş",
    partial: "Kısmi",
    voided: "İptal edildi",
    queued: "Kuyrukta",
    sending: "Gönderiliyor",
    scheduled: "Planlandı",
    no_show: "Gelmedi",
    regular: "Normal",
    makeup: "Telafi",
    makeup_planned: "Planlanan telafi",
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
    /* P0 (2026-09-05) — Telafi her yerde SARI, İşlendi KIRMIZI (owner talimatı;
       tek kaynak ATTENDANCE_CALENDAR_COLORS ile aynı anlam/renk dili). */
    makeup: "bg-amber-100 text-amber-900",
    makeup_planned: "bg-orange-100 text-orange-900",
    processed: "bg-rose-100 text-rose-900",
    /**
     * P0-F (2026-09-02) — Yoklama Raporu'nda Gelmedi/Mazeretli, paylaşılan
     * `absent`/`late` anahtarlarını (başka ekranlarda ZATEN farklı anlamda
     * kullanılıyor — ör. `absent` kırmızı, ödeme/telafi bağlamında "acil"
     * anlamına geliyor) YENİDEN KULLANMAK yerine kendi ayrı anahtarlarını
     * alır — böylece Telafi (kırmızı) ile Gelmedi GÖRSEL OLARAK KARIŞMAZ,
     * ve diğer hiçbir ekranın rengi bu değişiklikten ETKİLENMEZ (yalnız
     * EKLEME, mevcut hiçbir anahtar değiştirilmedi).
     */
    lesson_absent: "bg-orange-100 text-orange-800",
    lesson_excused: "bg-violet-100 text-violet-800",
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
