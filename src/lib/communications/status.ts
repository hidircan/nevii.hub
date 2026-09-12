/**
 * CommunicationMessage durum makinesi (FAZ 3).
 * Ayrı ve kasıtlı olarak tahsilat FollowUpStatus'tan bağımsız — burada
 * "approved" olmadan hiçbir provider/manual send başlatılamaz kuralı katı.
 */

export const COMMUNICATION_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  /** P1 (2026-09-11) — outbox şeridi: onay sonrası kuyruk, gönderim denemesi, iptal. */
  "queued",
  "sending",
  "manual_send_pending",
  "provider_accepted",
  "delivered",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

const ALLOWED: Record<CommunicationStatus, readonly CommunicationStatus[]> = {
  draft: ["draft", "pending_approval", "blocked", "cancelled"],
  pending_approval: ["pending_approval", "draft", "approved", "blocked", "cancelled"],
  approved: ["approved", "queued", "manual_send_pending", "provider_accepted", "failed", "pending_approval", "cancelled"],
  queued: ["queued", "sending", "cancelled", "pending_approval"],
  sending: ["sending", "queued", "delivered", "failed", "blocked"],
  manual_send_pending: ["manual_send_pending", "delivered", "failed", "pending_approval"],
  provider_accepted: ["provider_accepted", "delivered", "failed", "pending_approval"],
  delivered: ["delivered"],
  failed: ["failed", "queued", "pending_approval"],
  blocked: ["blocked", "queued", "pending_approval"],
  cancelled: ["cancelled"],
};

/** Onaydan sonra yeniden düzenlenebilir/görünür kabul edilen "aktif taslak" durumları. */
export const EDITABLE_STATUSES: readonly CommunicationStatus[] = ["draft", "pending_approval"];

/** Toplu onayda seçilebilir durumlar (FAZ5). */
export const BULK_SELECTABLE_STATUSES: readonly CommunicationStatus[] = ["draft", "pending_approval"];

export function isCommunicationStatus(value: string): value is CommunicationStatus {
  return (COMMUNICATION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionCommunication(from: CommunicationStatus, to: CommunicationStatus): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export class CommunicationTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  constructor(from: CommunicationStatus, to: CommunicationStatus) {
    super(`Geçersiz iletişim mesajı geçişi: ${from} → ${to}`);
    this.name = "CommunicationTransitionError";
  }
}

export function assertCommunicationTransition(from: CommunicationStatus, to: CommunicationStatus): void {
  if (!canTransitionCommunication(from, to)) {
    throw new CommunicationTransitionError(from, to);
  }
}
