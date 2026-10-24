/**
 * ÖDEME DURUMU — TEK KAYNAK (2026-10-20).
 *
 * Kök neden (Ödemeler dış liste ↔ öğrenci detayı uyuşmazlığı): `Payment.status`'taki "overdue" yalnız satır
 * OLUŞTURULURKEN damgalanıyor, sonra hiç yenilenmiyordu — vadesi geçmiş satır sonsuza dek "Bekliyor" kalıyordu.
 * Bazı ekranlar vadeyi kendisi karşılaştırıyor (mobil sayaç, anlık `Date` ile), bazıları ham statüyü basıyordu;
 * iptal/yenilenmiş sözleşmenin ödenmemiş taksiti dış listede "Bekliyor" görünürken detayda borç sayılmıyordu.
 *
 * Kural: görünen durum TÜRETİLİR, DB'ye geri yazılmaz (migration/veri değişikliği yok). Vade karşılaştırması
 * kurum saatinde (Europe/Istanbul) GÜN bazındadır: vade günü biterse ertesi gün "Gecikmiş" olur.
 * Öncelik: İptal → Ödendi → Sözleşme kapandı (borç değil) → Gecikmiş → Kısmi → Yaklaşan → Bekliyor.
 */
import type { PaymentStatus } from "../types";
import { DEFAULT_APP_TIMEZONE, addDaysYmd, toZonedYmd } from "../timezone";

/** Integer kuruş/TL tutarları — float kullanma. */
export function remainingAmount(amount: number, paidAmount: number): number {
  return Math.max(0, Math.trunc(amount) - Math.trunc(paidAmount));
}

export type PaymentDisplayStatus = "voided" | "closed" | "paid" | "overdue" | "partial" | "upcoming" | "pending";

/** Vadesine bu kadar gün (bugün dahil) kalan açık satır "Yaklaşan"dır. */
export const UPCOMING_WINDOW_DAYS = 7;

export const PAYMENT_STATUS_INFO: Record<
  PaymentDisplayStatus,
  { label: string; description: string; tone: "success" | "warning" | "danger" | "info" | "muted" }
> = {
  paid: { label: "Ödendi", description: "Tutarın tamamı tahsil edildi.", tone: "success" },
  overdue: {
    label: "Gecikmiş",
    description: "Vade günü geçti, kalan tutar henüz tahsil edilmedi (kısmen ödenmiş olabilir).",
    tone: "danger",
  },
  partial: { label: "Kısmi", description: "Bir kısmı tahsil edildi; kalanın vadesi henüz geçmedi.", tone: "warning" },
  upcoming: {
    label: "Yaklaşan",
    description: `Vadesine ${UPCOMING_WINDOW_DAYS} gün veya daha az kaldı; henüz tahsil edilmedi.`,
    tone: "info",
  },
  pending: {
    label: "Bekliyor",
    description: `Vadesi henüz gelmedi (${UPCOMING_WINDOW_DAYS} günden uzak); şu an tahsilat beklenmiyor.`,
    tone: "muted",
  },
  closed: {
    label: "Sözleşme kapandı",
    description: "İptal edilen veya yenilenen sözleşmenin ödenmemiş taksiti — kayıt korunur ama borç sayılmaz.",
    tone: "muted",
  },
  voided: { label: "İptal edildi", description: "Satır iptal edildi; hiçbir borç ve tahsilat toplamında sayılmaz.", tone: "muted" },
};

/** Kurum saatinde bugünün yyyy-MM-dd'si. */
export function todayYmdInstitution(now: Date = new Date()): string {
  return toZonedYmd(now, DEFAULT_APP_TIMEZONE);
}

/** Vade gününün kurum saatindeki yyyy-MM-dd'si (yalnız tarih "2026-10-05" veya tam ISO). */
export function dueYmdOf(dueDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return dueDate;
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? dueDate.slice(0, 10) : toZonedYmd(d, DEFAULT_APP_TIMEZONE);
}

type StatusInput = { status: string; amount: number; paidAmount: number; dueDate: string; contractId?: string | null };

/** TEK durum çözücü — liste rozeti, filtreler, özet kartlar, öğrenci detayı ve takvim bunu kullanır. */
export function resolvePaymentDisplayStatus(
  p: StatusInput,
  terminalContractIds: ReadonlySet<string> = new Set(),
  todayYmd: string = todayYmdInstitution()
): PaymentDisplayStatus {
  if (p.status === "voided") return "voided";
  if (p.status === "paid" || remainingAmount(p.amount, p.paidAmount) <= 0) return "paid";
  if (p.contractId && terminalContractIds.has(p.contractId)) return "closed";
  const due = dueYmdOf(p.dueDate);
  if (due < todayYmd) return "overdue";
  if (Math.trunc(p.paidAmount) > 0) return "partial";
  return due <= addDaysYmd(todayYmd, UPCOMING_WINDOW_DAYS) ? "upcoming" : "pending";
}

/** Canlı borcun vadesi geçti mi (ham `status === "overdue"` yerine HER YERDE bu). */
export function isPaymentOverdue(p: StatusInput, todayYmd: string = todayYmdInstitution()): boolean {
  return resolvePaymentDisplayStatus(p, undefined, todayYmd) === "overdue";
}

/**
 * Saklanan statü ailesine (PaymentStatus) indirgenmiş canonical durum — `PaymentStatus` bekleyen çağıranlar
 * (takvim ay kutusu, öğrenci listesi özeti) için. Sözleşme bilgisi olmadan çağrılır (closed üretmez).
 */
export function canonicalPaymentStatus(p: StatusInput, todayYmd: string = todayYmdInstitution()): PaymentStatus {
  const s = resolvePaymentDisplayStatus(p, undefined, todayYmd);
  return s === "upcoming" || s === "pending" || s === "closed" ? "pending" : s;
}

export function resolveCollectionStatus(input: {
  amount: number;
  paidAmount: number;
  dueDate: string;
  now?: Date;
  voided?: boolean;
}): PaymentStatus {
  return canonicalPaymentStatus(
    { status: input.voided ? "voided" : "pending", amount: input.amount, paidAmount: input.paidAmount, dueDate: input.dueDate },
    todayYmdInstitution(input.now)
  );
}
