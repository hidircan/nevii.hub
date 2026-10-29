import type { RefreshScope } from "./refresh-bus";

/**
 * Push kategorisi → revalidation kapsamı eşleşmesi (Faz 8).
 *
 * Sunucu push `data.kind` değerleri (bkz. push-destination.ts + sender):
 * ders hatırlatması/iptali/değişikliği → program + devam tazelenir;
 * ödeme bildirimi → ledger/bakiye; ödev → ödev listesi. Bilinmeyen kategori
 * yalnız bildirim merkezini tazeler (güvenli varsayılan).
 */

const LESSON_KINDS: Record<string, true> = {
  lesson_started: true,
  lesson_upcoming: true,
  lesson_reminder_1d: true,
  lesson_reminder_1h: true,
  lesson_reminder_15m: true,
  lesson_cancelled: true,
  lesson_rescheduled: true,
  lesson_reassigned: true,
};

const HOMEWORK_KINDS: Record<string, true> = {
  homework_missing_for_lesson: true,
  homework_due_date_changed: true,
};

const PAYMENT_KINDS: Record<string, true> = {
  payment_overdue: true,
  payment_failed_or_pending: true,
  payment_received: true,
};

export function scopesForPushKind(kind: string | undefined): RefreshScope[] {
  if (!kind) return ["notifications"];
  if (LESSON_KINDS[kind]) return ["schedule", "attendance", "notifications"];
  if (HOMEWORK_KINDS[kind]) return ["homework", "notifications"];
  if (PAYMENT_KINDS[kind]) return ["payments", "notifications"];
  return ["notifications"];
}
