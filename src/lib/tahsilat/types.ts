import type { FollowUpStatus } from "./status";

export type FollowUpChannel = "whatsapp" | "sms" | "manual";

export type FollowUpAttemptStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "undelivered"
  | "manual_send_pending";

export type DeliveryConfidence = "none" | "provider_accepted" | "delivered";

export type FollowUpAttempt = {
  id: string;
  channel: FollowUpChannel;
  status: FollowUpAttemptStatus;
  approvedContent: string;
  recipientMasked: string;
  providerMessageId?: string;
  idempotencyKey: string;
  segmentCount?: number;
  errorCode?: string;
  errorSummary?: string;
  deliveryConfidence: DeliveryConfidence;
  costNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpEvent = {
  id: string;
  fromStatus: FollowUpStatus;
  toStatus: FollowUpStatus;
  actorUserId?: string;
  reason?: string;
  at: string;
};

export type FollowUpCase = {
  id: string;
  tenantId: string;
  paymentId: string;
  studentId: string;
  status: FollowUpStatus;
  messageDraft: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  resolvedAt?: string;
  attributedAmount: number;
  createdAt: string;
  updatedAt: string;
  /** v3 */
  openingBalance?: number;
  currentBalance?: number;
  currency?: string;
  dueDate?: string;
  daysOverdue?: number;
  selectedChannel?: FollowUpChannel;
  approvedMessage?: string;
  lastError?: string;
  closedAt?: string;
  attributedPaidSnapshot?: number;
  attempts?: FollowUpAttempt[];
  events?: FollowUpEvent[];
};

export type PublicFollowUpAttempt = Omit<FollowUpAttempt, "approvedContent"> & {
  contentChars: number;
};

export type PublicFollowUpCase = Omit<FollowUpCase, "attempts"> & {
  attempts?: PublicFollowUpAttempt[];
};

export function toPublicCase(c: FollowUpCase): PublicFollowUpCase {
  return {
    ...c,
    attempts: c.attempts?.map((a) => ({
      id: a.id,
      channel: a.channel,
      status: a.status,
      recipientMasked: a.recipientMasked,
      providerMessageId: a.providerMessageId,
      idempotencyKey: a.idempotencyKey,
      segmentCount: a.segmentCount,
      errorCode: a.errorCode,
      errorSummary: a.errorSummary,
      deliveryConfidence: a.deliveryConfidence,
      costNote: a.costNote,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      contentChars: a.approvedContent.length,
    })),
  };
}
