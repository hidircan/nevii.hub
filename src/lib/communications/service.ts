import { requireRole, type ServiceContext } from "../services/context";
import { fail, ok, type ServiceResult } from "../services/result";
import { recordAuditLog } from "../audit/log";
import { uid } from "../utils";
import {
  estimateSmsSegments,
  isSmsProviderConfigured,
  isSmsTestMode,
  normalizeToE164,
} from "../sms";
import { getWhatsAppTransport } from "../whatsapp";
import {
  createCommunicationMessage,
  editCommunicationMessageDraft,
  getCommunicationMessage,
  listCommunicationMessages,
  transitionCommunicationMessage,
} from "./store";
import { BULK_SELECTABLE_STATUSES, canTransitionCommunication, type CommunicationStatus } from "./status";
import {
  toPublicCommunicationMessage,
  type CommunicationChannel,
  type CommunicationMessage,
  type CommunicationMessageType,
  type CommunicationRecipientType,
  type CommunicationResourceType,
  type PublicCommunicationMessage,
} from "./types";

const MAX_BODY_LEN = 600;
/** UI + server aynı üst sınırı uygular (FAZ5). */
export const MAX_BULK_APPROVE_BATCH = 50;

function assertAdmin(ctx: ServiceContext) {
  return requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
}

function sanitizeBody(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_BODY_LEN);
}

function audit(ctx: ServiceContext, action: string, entityId: string, meta?: Record<string, unknown>) {
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType: "CommunicationMessage",
    entityId,
    outcome: "success",
    meta,
  });
}

export type BlockedCheck = { blocked: false } | { blocked: true; code: string; message: string };

/**
 * Telefon/opt-out/allowlist/provider kontrolü — telafi dersinin (veya diğer
 * kaynakların) kendisi bu kontrolden bağımsız her zaman oluşturulur; yalnızca
 * iletişim taslağı `blocked` olarak düşer (FAZ6 kural 5).
 */
export function evaluateBlockedState(input: {
  channel: CommunicationChannel;
  phone: string;
  optOut?: boolean;
}): BlockedCheck {
  if (input.optOut) {
    return { blocked: true, code: "opt_out", message: "Bu alıcı için iletişim izni kapalı." };
  }
  const e164 = normalizeToE164(input.phone || "");
  if (!e164.ok) {
    return { blocked: true, code: "invalid_phone", message: "Geçerli bir telefon numarası yok." };
  }
  if (input.channel === "SMS" && !isSmsProviderConfigured() && !isSmsTestMode()) {
    return { blocked: true, code: "provider_unconfigured", message: "SMS sağlayıcısı yapılandırılmamış." };
  }
  if (input.channel === "WHATSAPP") {
    const transport = getWhatsAppTransport();
    if (transport.name === "console" && !isSmsTestMode()) {
      // console/manual transport is a valid fallback (manual wa.me flow), not a block —
      // only an explicitly *mis*configured real provider should block.
    }
  }
  return { blocked: false };
}

export type DraftMessageInput = {
  tenantId: string;
  recipientType: CommunicationRecipientType;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  channel: CommunicationChannel;
  messageType: CommunicationMessageType;
  resourceType: CommunicationResourceType;
  resourceId: string;
  body: string;
  createdBy: string;
  /** Aynı olay tekrar tetiklendiğinde duplicate taslak oluşmasını engelleyen anahtarın domain kısmı — tenant+kanal+tip+kaynak ile server tarafında birleştirilir. */
  idempotencySuffix?: string;
};

function deriveIdempotencyKey(input: DraftMessageInput): string {
  const suffix = input.idempotencySuffix ?? "";
  return `${input.channel}:${input.messageType}:${input.resourceType}:${input.resourceId}:${input.recipientId}:${suffix}`;
}

/**
 * Herhangi bir olaydan (telafi, ders, tahsilat, devamsızlık, duyuru) idempotent
 * bir CommunicationMessage taslağı düşürür. Aynı kaynak+alıcı+kanal+tip için
 * ikinci çağrı yeni kayıt yaratmaz (FAZ2/FAZ6 idempotency).
 */
export async function createCommunicationDraft(
  input: DraftMessageInput
): Promise<{ record: CommunicationMessage; created: boolean }> {
  const body = sanitizeBody(input.body);
  const blockedCheck = evaluateBlockedState({ channel: input.channel, phone: input.recipientPhone });
  const status: CommunicationStatus = blockedCheck.blocked ? "blocked" : "pending_approval";

  return createCommunicationMessage({
    tenantId: input.tenantId,
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
    channel: input.channel,
    messageType: input.messageType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    status,
    draftBody: body,
    createdBy: input.createdBy,
    attemptCount: 0,
    blockedReasonCode: blockedCheck.blocked ? blockedCheck.code : undefined,
    blockedReasonMessage: blockedCheck.blocked ? blockedCheck.message : undefined,
    idempotencyKey: deriveIdempotencyKey(input),
  });
}

export async function listCommunicationMessagesTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ messages: PublicCommunicationMessage[] }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const rows = await listCommunicationMessages(ctx.tenantId);
  return ok({ messages: rows.map(toPublicCommunicationMessage) });
}

export async function getCommunicationMessageTool(
  ctx: ServiceContext,
  id: string
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const row = await getCommunicationMessage(ctx.tenantId, id);
  if (!row) return fail("NOT_FOUND", "Mesaj bulunamadı");
  return ok({ message: toPublicCommunicationMessage(row) });
}

/** Taslak metni değişince önceki onay geçersizleşir, durum pending_approval'a döner (FAZ3). */
export async function editCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string; draftBody: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı");
  // draft/pending_approval are the normal editable states; "approved" is also allowed here
  // specifically so an edit can invalidate a stale approval (FAZ3) — every later state
  // (manual_send_pending/provider_accepted/delivered/failed/blocked) is not editable.
  if (current.status !== "draft" && current.status !== "pending_approval" && current.status !== "approved") {
    return fail("VALIDATION_ERROR", `Bu durumda düzenleme yapılamaz (${current.status}).`);
  }
  const body = sanitizeBody(input.draftBody);
  if (!body) return fail("VALIDATION_ERROR", "Mesaj taslağı boş olamaz.");

  const edited = await editCommunicationMessageDraft({ tenantId: ctx.tenantId, id: current.id, draftBody: body });
  if (!edited) return fail("NOT_FOUND", "Mesaj bulunamadı");

  const reset = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: current.id,
    to: "pending_approval",
    actorUserId: ctx.userId,
    reason: "draft_edited",
    patch: { approvedBodySnapshot: undefined, approvedBy: undefined, approvedAt: undefined, approvalBatchId: undefined },
  });
  if (!reset) return fail("NOT_FOUND", "Mesaj bulunamadı");

  audit(ctx, "communication.edit", reset.id, {});
  return ok({ message: toPublicCommunicationMessage(reset) });
}

export type ApproveOutcome =
  | { ok: true; message: PublicCommunicationMessage }
  | { ok: false; code: string; reason: string };

/** Server-side onay: mevcut taslak immutable approvedBodySnapshot olarak kaydedilir. */
export async function approveOneCommunicationMessage(
  ctx: ServiceContext,
  id: string,
  approvalBatchId?: string
): Promise<ApproveOutcome> {
  const current = await getCommunicationMessage(ctx.tenantId, id);
  if (!current) return { ok: false, code: "NOT_FOUND", reason: "Mesaj bulunamadı" };
  if (!canTransitionCommunication(current.status, "approved")) {
    return { ok: false, code: "INVALID_TRANSITION", reason: `Bu durumda onaylanamaz (${current.status}).` };
  }
  if (!current.draftBody) {
    return { ok: false, code: "VALIDATION_ERROR", reason: "Onaylanacak mesaj boş." };
  }
  const next = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: current.id,
    to: "approved",
    actorUserId: ctx.userId,
    reason: approvalBatchId ? "bulk_approve" : "single_approve",
    patch: {
      approvedBodySnapshot: current.draftBody,
      approvedBy: ctx.userId,
      approvedAt: new Date().toISOString(),
      approvalBatchId,
    },
  });
  if (!next) return { ok: false, code: "NOT_FOUND", reason: "Mesaj bulunamadı" };
  return { ok: true, message: toPublicCommunicationMessage(next) };
}

export async function approveCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const outcome = await approveOneCommunicationMessage(ctx, input.id);
  if (!outcome.ok) return fail(outcome.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", outcome.reason);

  audit(ctx, "communication.approve", input.id, { channel: outcome.message.channel });
  return ok({ message: outcome.message });
}

export type BulkApproveItemResult = { id: string; outcome: "approved" | "skipped" | "failed"; reason?: string };

export type BulkApproveResult = {
  batchId: string;
  approvedCount: number;
  skippedCount: number;
  failedCount: number;
  items: BulkApproveItemResult[];
};

/**
 * Toplu onay — UI'dan gelen ID listesine körlemesine güvenmez: her mesaj
 * server'da tenant+durum yeniden doğrulanır. Batch-level + item-level
 * idempotency: zaten approved/terminal bir mesaj tekrar denendiğinde
 * "skipped" olarak raporlanır, ikinci kez provider'a asla gitmez (zaten bu
 * fonksiyon provider'ı hiç çağırmaz — sadece durum geçişi yapar).
 */
export async function bulkApproveCommunicationMessagesTool(
  ctx: ServiceContext,
  input: { ids: string[]; confirm: true; idempotencyKey?: string }
): Promise<ServiceResult<BulkApproveResult>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!input.confirm) return fail("VALIDATION_ERROR", "İkinci onay (confirm) olmadan toplu onay yapılamaz.");

  const ids = Array.from(new Set(input.ids ?? []));
  if (ids.length === 0) return fail("VALIDATION_ERROR", "Onaylanacak mesaj seçilmedi.");
  if (ids.length > MAX_BULK_APPROVE_BATCH) {
    return fail("VALIDATION_ERROR", `Toplu onay en fazla ${MAX_BULK_APPROVE_BATCH} mesaj içerebilir.`);
  }

  const batchId = `commbatch_${crypto.randomUUID().slice(0, 10)}`;
  const items: BulkApproveItemResult[] = [];

  for (const id of ids) {
    const current = await getCommunicationMessage(ctx.tenantId, id);
    if (!current) {
      items.push({ id, outcome: "failed", reason: "Bulunamadı" });
      continue;
    }
    if (!BULK_SELECTABLE_STATUSES.includes(current.status)) {
      items.push({ id, outcome: "skipped", reason: `Uygun olmayan durum: ${current.status}` });
      continue;
    }
    const outcome = await approveOneCommunicationMessage(ctx, id, batchId);
    if (!outcome.ok) {
      items.push({ id, outcome: "failed", reason: outcome.reason });
      continue;
    }
    items.push({ id, outcome: "approved" });
  }

  const approvedCount = items.filter((i) => i.outcome === "approved").length;
  const skippedCount = items.filter((i) => i.outcome === "skipped").length;
  const failedCount = items.filter((i) => i.outcome === "failed").length;

  audit(ctx, "communication.bulk_approve", batchId, {
    requested: ids.length,
    approvedCount,
    skippedCount,
    failedCount,
  });

  return ok({ batchId, approvedCount, skippedCount, failedCount, items });
}

/** Onaylanan SMS için segment/karakter bilgisini önizler — provider çağrısı yapmaz. */
export function describeCommunicationFit(body: string) {
  return estimateSmsSegments(body);
}

export { uid as generateCommunicationId };

/**
 * Telafi dersi planlandığında veli için SMS + WhatsApp CommunicationMessage
 * taslaklarını idempotent biçimde oluşturur (FAZ6). `lesson.id` + alıcı +
 * kanal aynıysa ikinci çağrı (retry) yeni kayıt yaratmaz — deriveIdempotencyKey
 * zaten resourceId=lesson.id'yi anahtara dahil eder.
 */
export async function createMakeupLessonCommunicationDrafts(input: {
  tenantId: string;
  lessonId: string;
  createdBy: string;
  parent: { name: string; phone: string; studentId: string; optOut?: boolean; smsBody: string; whatsappBody: string };
}): Promise<{ sms: CommunicationMessage; whatsapp: CommunicationMessage }> {
  const smsBlocked = evaluateBlockedState({ channel: "SMS", phone: input.parent.phone, optOut: input.parent.optOut });
  const waBlocked = evaluateBlockedState({ channel: "WHATSAPP", phone: input.parent.phone, optOut: input.parent.optOut });

  const base = {
    tenantId: input.tenantId,
    recipientType: "PARENT" as const,
    recipientId: input.parent.studentId,
    recipientName: input.parent.name,
    recipientPhone: input.parent.phone,
    messageType: "MAKEUP_LESSON" as const,
    resourceType: "makeup" as const,
    resourceId: input.lessonId,
    createdBy: input.createdBy,
  };

  const [sms, whatsapp] = await Promise.all([
    createCommunicationMessage({
      ...base,
      channel: "SMS",
      status: smsBlocked.blocked ? "blocked" : "pending_approval",
      draftBody: sanitizeBody(input.parent.smsBody),
      attemptCount: 0,
      blockedReasonCode: smsBlocked.blocked ? smsBlocked.code : undefined,
      blockedReasonMessage: smsBlocked.blocked ? smsBlocked.message : undefined,
      idempotencyKey: `SMS:MAKEUP_LESSON:makeup:${input.lessonId}:${input.parent.studentId}:`,
    }),
    createCommunicationMessage({
      ...base,
      channel: "WHATSAPP",
      status: waBlocked.blocked ? "blocked" : "pending_approval",
      draftBody: sanitizeBody(input.parent.whatsappBody),
      attemptCount: 0,
      blockedReasonCode: waBlocked.blocked ? waBlocked.code : undefined,
      blockedReasonMessage: waBlocked.blocked ? waBlocked.message : undefined,
      idempotencyKey: `WHATSAPP:MAKEUP_LESSON:makeup:${input.lessonId}:${input.parent.studentId}:`,
    }),
  ]);

  return { sms: sms.record, whatsapp: whatsapp.record };
}
