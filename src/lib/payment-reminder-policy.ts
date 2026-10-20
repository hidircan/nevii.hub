/**
 * Ödeme hatırlatması kuralı — TEK kaynak (2026-10-20, P0).
 *
 * KÖK NEDEN: eski tarama "bekleyen" ödemeyi vadeye değil `createdAt`'e göre seçiyordu (oluşturulalı 7+ gün). Sözleşme
 * taksitleri sözleşmeyle birlikte oluşturulduğu için gelecek yıl Mayıs vadeli taksit de 7 gün sonra "bekleyen ödeme"
 * oldu; 24 saatlik tekilleştirme + günlük cron her turda yöneticilere yeniden yazdı (canlı: 1.220 açık ödemenin
 * 1.142'si gelecek vadeli, tur başına ~2.300 bildirim). Artık aday = vadesi gelmiş/geçmiş canlı borç, ya da kurumun
 * seçtiği erken hatırlatma penceresindeki taksit. Vadesi olmayan satır aday değildir.
 *
 * Tekilleştirme "aşama" ile: her aşamanın bir başlangıç günü var (erken pencere başı / vade günü / vade + k×tekrar).
 * Aynı ödeme için o günden beri bildirim varsa yenisi yazılmaz → cron kaç kez dönerse dönsün aşama başına en fazla bir
 * bildirim. Eski bildirimler de gövdede ödeme kimliğini taşıdığı için aynı kontrolle sayılır (geçişte toplu bildirim yok).
 */
import type { CollectionsSettings, Payment } from "./types";
import { isLiveObligation } from "./payment-profile";

export const DEFAULT_PAYMENT_REMINDER = {
  enabled: true,
  /** 0 = gelecek vadeli taksit için hiç bildirim yok; yalnız vadesi gelmiş/geçmiş ödeme. */
  daysBefore: 0,
  /** Vade geçtikten sonra kaç günde bir tekrar (0 = tekrar yok). */
  repeatDays: 7,
  maxRepeats: 3,
} as const;

export type PaymentReminderSettings = { enabled: boolean; daysBefore: number; repeatDays: number; maxRepeats: number };

export function resolvePaymentReminderSettings(s: CollectionsSettings | null | undefined): PaymentReminderSettings {
  return {
    enabled: s?.paymentReminderEnabled ?? DEFAULT_PAYMENT_REMINDER.enabled,
    daysBefore: s?.paymentReminderDaysBefore ?? DEFAULT_PAYMENT_REMINDER.daysBefore,
    repeatDays: s?.paymentReminderRepeatDays ?? DEFAULT_PAYMENT_REMINDER.repeatDays,
    maxRepeats: s?.paymentReminderMaxRepeats ?? DEFAULT_PAYMENT_REMINDER.maxRepeats,
  };
}

const DAY_MS = 86_400_000;
/** Vadeler UTC gece yarısı saklanır (canlı: `2027-05-15 00:00`); gün farkı da UTC takvim günüyle (bkz. store-db overdue sayacı). */
const utcDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);

export type PaymentReminderDecision = {
  /** > 0: vadeye kalan gün (erken hatırlatma); 0: bugün; < 0: gecikme günü. */
  daysUntilDue: number;
  /** Aşama başlangıcı — tekilleştirme penceresi bu andan şimdiye kadardır. */
  since: Date;
  remaining: number;
};

export function shouldCreatePaymentReminder(
  p: Pick<Payment, "status" | "contractId" | "dueDate" | "amount" | "paidAmount">,
  settings: PaymentReminderSettings,
  terminalContractIds: ReadonlySet<string>,
  now: Date
): PaymentReminderDecision | null {
  if (!settings.enabled || !isLiveObligation(p, terminalContractIds)) return null;
  const remaining = Math.max(p.amount - (p.paidAmount ?? 0), 0);
  if (remaining <= 0 || !p.dueDate) return null;
  const due = utcDay(p.dueDate);
  if (Number.isNaN(due)) return null;
  const daysUntilDue = Math.round((due - utcDay(now.toISOString())) / DAY_MS);
  if (daysUntilDue > Math.max(settings.daysBefore, 0)) return null;
  let sinceMs = due;
  if (daysUntilDue > 0) sinceMs = due - settings.daysBefore * DAY_MS;
  else if (settings.repeatDays > 0) {
    const stage = Math.min(Math.floor(-daysUntilDue / settings.repeatDays), Math.max(settings.maxRepeats, 0));
    sinceMs = due + stage * settings.repeatDays * DAY_MS;
  }
  return { daysUntilDue, since: new Date(sinceMs), remaining };
}

/** Tarama DB'den yalnız bu kolonları okur (tüm ödeme satırı / tüm kurum verisi değil). */
export const PAYMENT_REMINDER_SELECT = {
  id: true,
  studentId: true,
  status: true,
  contractId: true,
  dueDate: true,
  amount: true,
  paidAmount: true,
  description: true,
  installmentPeriodLabel: true,
} as const;
