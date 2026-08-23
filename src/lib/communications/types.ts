import type { CommunicationStatus } from "./status";

export type CommunicationRecipientType = "PARENT" | "STUDENT" | "TEACHER";
export type CommunicationChannel = "SMS" | "WHATSAPP";
export type CommunicationMessageType =
  | "MAKEUP_LESSON"
  | "LESSON"
  | "COLLECTION"
  | "ABSENCE"
  | "ANNOUNCEMENT"
  | "OTHER";
export type CommunicationResourceType = "lesson" | "makeup" | "payment" | "announcement" | "task" | "other";

export type CommunicationEvent = {
  id: string;
  fromStatus: CommunicationStatus;
  toStatus: CommunicationStatus;
  actorUserId?: string;
  reason?: string;
  at: string;
};

export type CommunicationMessage = {
  id: string;
  tenantId: string;
  recipientType: CommunicationRecipientType;
  recipientId: string;
  recipientName: string;
  /** Ham telefon — hiçbir zaman API/UI/log'a maskesiz döndürülmez, bkz. toPublicCommunicationMessage. */
  recipientPhone: string;
  channel: CommunicationChannel;
  messageType: CommunicationMessageType;
  resourceType: CommunicationResourceType;
  resourceId: string;
  status: CommunicationStatus;
  draftBody: string;
  approvedBodySnapshot?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  attemptCount: number;
  providerResultCode?: string;
  providerResultSummary?: string;
  blockedReasonCode?: string;
  blockedReasonMessage?: string;
  idempotencyKey: string;
  approvalBatchId?: string;
  events: CommunicationEvent[];
  createdAt: string;
  updatedAt: string;
};

export type PublicCommunicationMessage = Omit<CommunicationMessage, "recipientPhone"> & {
  recipientPhoneMasked: string;
};

/** "0555 111 22 33" / "+90555..." → "+90***2233" — never leaks the full number. */
export function maskPhoneDisplay(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length < 6) return "***";
  return `${d.slice(0, 2)}***${d.slice(-4)}`;
}

export function toPublicCommunicationMessage(m: CommunicationMessage): PublicCommunicationMessage {
  const { recipientPhone, ...rest } = m;
  return { ...rest, recipientPhoneMasked: maskPhoneDisplay(recipientPhone) };
}

export type ApprovalBatchSummary = {
  id: string;
  tenantId: string;
  actorUserId: string;
  approvedCount: number;
  skippedCount: number;
  failedCount: number;
  createdAt: string;
};
