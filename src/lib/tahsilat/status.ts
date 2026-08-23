/**
 * Tahsilat vaka durum makinesi.
 * Eski durumlar (draft/replied/lost) korunur; v3 durumları eklenir.
 */

export const FOLLOW_UP_STATUSES = [
  "open",
  "draft",
  "draft_ready",
  "approved",
  "sending",
  "sent",
  "replied",
  "partial",
  "paid",
  "dismissed",
  "lost",
  "failed",
] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const TERMINAL_FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = ["paid", "lost", "dismissed"];

const OPEN_SET = new Set<FollowUpStatus>(
  FOLLOW_UP_STATUSES.filter((s) => !TERMINAL_FOLLOW_UP_STATUSES.includes(s))
);

const ALLOWED: Record<FollowUpStatus, readonly FollowUpStatus[]> = {
  open: ["draft", "draft_ready", "approved", "partial", "paid", "dismissed", "lost"],
  draft: ["draft", "open", "draft_ready", "approved", "partial", "paid", "dismissed", "lost"],
  draft_ready: ["draft_ready", "draft", "approved", "partial", "paid", "dismissed", "lost"],
  approved: ["approved", "sending", "sent", "failed", "partial", "paid", "dismissed", "lost", "draft_ready"],
  sending: ["sending", "sent", "failed", "approved", "paid", "partial"],
  sent: ["sent", "replied", "partial", "paid", "failed", "dismissed", "lost"],
  replied: ["replied", "partial", "paid", "dismissed", "lost"],
  partial: ["partial", "paid", "sent", "dismissed", "lost"],
  failed: ["failed", "approved", "sending", "dismissed", "lost", "paid", "partial"],
  paid: ["paid"],
  lost: ["lost"],
  dismissed: ["dismissed"],
};

export function isFollowUpStatus(value: string): value is FollowUpStatus {
  return (FOLLOW_UP_STATUSES as readonly string[]).includes(value);
}

export function isOpenFollowUpStatus(status: FollowUpStatus): boolean {
  return OPEN_SET.has(status);
}

export function isTerminalFollowUpStatus(status: FollowUpStatus): boolean {
  return TERMINAL_FOLLOW_UP_STATUSES.includes(status);
}

export function canTransitionFollowUp(from: FollowUpStatus, to: FollowUpStatus): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from: FollowUpStatus, to: FollowUpStatus): void {
  if (!canTransitionFollowUp(from, to)) {
    throw new FollowUpTransitionError(from, to);
  }
}

export class FollowUpTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  constructor(from: FollowUpStatus, to: FollowUpStatus) {
    super(`Geçersiz vaka geçişi: ${from} → ${to}`);
    this.name = "FollowUpTransitionError";
  }
}

export function normalizeLegacyStatus(status: string): FollowUpStatus {
  if (isFollowUpStatus(status)) return status;
  return "draft";
}
