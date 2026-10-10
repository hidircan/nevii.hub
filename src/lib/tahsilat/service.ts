import { requireRole, type ServiceContext } from "../services/context";
import { fail, ok, type ServiceResult } from "../services/result";
import { recordAuditLog } from "../audit/log";
import { readData, readReferenceData } from "../store";
import { runWithTenantAsync } from "../tenant-context";
import { getWhatsAppTransport } from "../whatsapp";
import {
  estimateSmsSegments,
  isSmsProviderConfigured,
  isSmsTestMode,
  maskE164,
  normalizeToE164,
  sendSmsGuarded,
  smsIdempotencyKey,
  SmsPolicyError,
} from "../sms";
import { uid } from "../utils";
import {
  findAttemptByIdempotency,
  getFollowUpCase,
  recordFollowUpAttempt,
  transitionFollowUpCase,
  upsertFollowUpCase,
} from "./cases";
import type { FollowUpAttempt, FollowUpCase, FollowUpChannel } from "./types";
import { canTransitionFollowUp } from "./status";
import { buildDeterministicCollectionsDraft, describeMessageFit, sanitizeCollectionsMessage } from "./message";

function audit(
  ctx: ServiceContext,
  action: string,
  entityId: string,
  meta?: Record<string, unknown>
) {
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType: "PaymentFollowUpCase",
    entityId,
    outcome: "success",
    meta,
  });
}

function assertAdmin(ctx: ServiceContext) {
  return requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
}

export async function approveFollowUpCaseTool(
  ctx: ServiceContext,
  input: { caseId?: string; paymentId: string; studentId: string; message: string; channel?: FollowUpChannel }
): Promise<ServiceResult<{ caseId: string; status: string; approvedMessage: string; fit: ReturnType<typeof describeMessageFit> }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const message = sanitizeCollectionsMessage(input.message);
  if (!message) return fail("VALIDATION_ERROR", "Onaylanacak mesaj boş olamaz.");

  // ctx.tenantId may have been overridden by the caller (route katmanı, bkz.
  // resolveWriteScope — SUPER_ADMIN başka bir kurum seçmiş olabilir) ama
  // ambient ALS (AsyncLocalStorage) hâlâ withApiHandler'ın kurduğu ORİJİNAL
  // oturum kurumunu taşır. readData() önce ALS'ye bakar — açıkça
  // runWithTenantAsync(ctx.tenantId, ...) ile sarmalamazsak, seçili kurum
  // yerine yanlış kurumun verisi okunur (bkz. payments/[paymentId]/pay
  // route'undaki aynı desen).
  const data = await runWithTenantAsync(ctx.tenantId, () => readData());
  const payment = data.payments.find((p) => p.id === input.paymentId);
  if (!payment) return fail("NOT_FOUND", "Ödeme bulunamadı");
  const student = data.students.find((s) => s.id === input.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");

  let current = input.caseId ? await getFollowUpCase(ctx.tenantId, input.caseId) : null;
  if (input.caseId && !current) return fail("NOT_FOUND", "Vaka bulunamadı");

  if (!current) {
    current = await upsertFollowUpCase({
      tenantId: ctx.tenantId,
      paymentId: payment.id,
      studentId: student.id,
      status: "draft",
      messageDraft: message,
      attributedAmount: 0,
      openingBalance: payment.amount,
      currentBalance: Math.max(payment.amount - payment.paidAmount, 0),
      currency: data.settings.currency || "TRY",
      dueDate: payment.dueDate,
    });
  }

  if (current.approvedMessage === message && current.status === "approved") {
    return ok({
      caseId: current.id,
      status: current.status,
      approvedMessage: current.approvedMessage,
      fit: describeMessageFit(message),
    });
  }

  if (!canTransitionFollowUp(current.status, "approved")) {
    return fail("VALIDATION_ERROR", `Bu vakada onay yapılamaz (${current.status}).`);
  }

  const next = await transitionFollowUpCase({
    tenantId: ctx.tenantId,
    caseId: current.id,
    to: "approved",
    actorUserId: ctx.userId,
    reason: "human_approve",
    patch: {
      messageDraft: message,
      approvedMessage: message,
      approvedBy: ctx.userId,
      approvedAt: new Date().toISOString(),
      selectedChannel: input.channel ?? current.selectedChannel ?? "whatsapp",
    },
  });
  if (!next) return fail("NOT_FOUND", "Vaka bulunamadı");

  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action: "tahsilat.case.approve",
    entityType: "PaymentFollowUpCase",
    entityId: next.id,
    outcome: "success",
    meta: { paymentId: payment.id, channel: next.selectedChannel },
  });

  try {
    const { notifyAdmins } = await import("../manager-notifications");
    await notifyAdmins(
      ctx.tenantId,
      "collections_approval_pending",
      {
        title: "Tahsilat mesajı onaylandı",
        body: `Onaylanan mesaj gönderime hazır. Detay: /panel/ai/tahsilat-agent`,
      },
      { excludeUserId: ctx.userId, dedupeKey: next.id }
    );
  } catch {
    // best-effort
  }

  return ok({
    caseId: next.id,
    status: next.status,
    approvedMessage: next.approvedMessage ?? message,
    fit: describeMessageFit(message),
  });
}

export async function sendFollowUpMessageTool(
  ctx: ServiceContext,
  input: {
    caseId: string;
    channel: FollowUpChannel;
    confirm: true;
    markManualPending?: boolean;
  }
): Promise<ServiceResult<{ caseId: string; attemptId: string; status: string; channel: FollowUpChannel; deliveryConfidence: string }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (!input.confirm) return fail("VALIDATION_ERROR", "Gönderim için açık onay gerekir.");

  const current = await getFollowUpCase(ctx.tenantId, input.caseId);
  if (!current) return fail("NOT_FOUND", "Vaka bulunamadı");
  if (!current.approvedMessage) {
    return fail("VALIDATION_ERROR", "Onaylanmış mesaj yok.");
  }
  const body = current.approvedMessage;

  // bkz. approveFollowUpCaseTool'daki aynı yorum — ctx.tenantId (seçili
  // kurum) ile ambient ALS uyuşmayabilir, açıkça sarmalanır.
  const data = await runWithTenantAsync(ctx.tenantId, () => readReferenceData());
  const student = data.students.find((s) => s.id === current.studentId);
  if (!student) return fail("NOT_FOUND", "Öğrenci bulunamadı");
  if (student.communicationOptOut) {
    return fail("FORBIDDEN", "Bu kişi için iletişim izni kapalı.");
  }

  const phoneRaw = student.parentPhone || "";
  const e164 = normalizeToE164(phoneRaw);
  const key = smsIdempotencyKey(ctx.tenantId, current.id, input.channel, body);
  const existing = await findAttemptByIdempotency(ctx.tenantId, current.id, key);
  if (existing && (existing.status === "sent" || existing.status === "sending" || existing.status === "manual_send_pending" || existing.status === "delivered")) {
    // Idempotent replay of an already-approved send (duplicate click/retry) — short-circuit
    // before the approval-status guard below, which is about blocking *new* sends of an
    // unapproved case, not about re-serving a result for a request already fulfilled.
    return ok({
      caseId: current.id,
      attemptId: existing.id,
      status: current.status,
      channel: input.channel,
      deliveryConfidence: existing.deliveryConfidence,
    });
  }

  // Server-side enforce human approval BEFORE any outbound call: only an "approved" case
  // (or a "failed" one, to allow retry of an already-approved send) may go out. Draft,
  // dismissed, paid, and every other status must never reach the provider — approving
  // is a distinct, separate action (see approve endpoint) and cannot be inferred from
  // approvedMessage merely being non-empty.
  if (current.status !== "approved" && current.status !== "failed") {
    return fail(
      "VALIDATION_ERROR",
      `Vaka onaylanmadan gönderilemez (mevcut durum: ${current.status}).`
    );
  }

  const now = new Date().toISOString();
  const attemptBase: FollowUpAttempt = existing ?? {
    id: uid("fuatt"),
    channel: input.channel,
    status: "sending",
    approvedContent: body,
    recipientMasked: e164.ok ? maskE164(e164.e164) : "***",
    idempotencyKey: key,
    segmentCount: input.channel === "sms" ? estimateSmsSegments(body).segments : undefined,
    deliveryConfidence: "none",
    costNote: input.channel === "sms" ? "Sağlayıcıya göre değişir" : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (input.channel === "sms") {
    if (!e164.ok) return fail("VALIDATION_ERROR", e164.message);
    try {
      const result = await sendSmsGuarded({ to: e164.e164, body });
      const attempt: FollowUpAttempt = {
        ...attemptBase,
        status: result.ok ? "sent" : "failed",
        providerMessageId: result.messageId,
        errorCode: result.errorCode,
        errorSummary: result.ok ? undefined : result.error,
        deliveryConfidence: result.ok ? "provider_accepted" : "none",
        updatedAt: new Date().toISOString(),
      };
      await recordFollowUpAttempt(ctx.tenantId, current.id, attempt);
      const nextStatus = result.ok ? "sent" : "failed";
      await transitionFollowUpCase({
        tenantId: ctx.tenantId,
        caseId: current.id,
        to: nextStatus,
        actorUserId: ctx.userId,
        reason: "sms_send",
        patch: {
          selectedChannel: "sms",
          sentAt: result.ok ? now : current.sentAt,
          lastError: result.ok ? undefined : result.error,
        },
      });
      audit(ctx, result.ok ? "tahsilat.sms.sent" : "tahsilat.sms.failed", current.id, {
        channel: "sms",
        testMode: isSmsTestMode(),
        configured: isSmsProviderConfigured(),
        errorCode: result.errorCode,
      });
      if (!result.ok) {
        try {
          const { notifyAdmins } = await import("../manager-notifications");
          await notifyAdmins(
            ctx.tenantId,
            "collections_send_failed",
            { title: "Tahsilat SMS gönderilemedi", body: `SMS denemesi başarısız. Detay: /panel/ai/tahsilat-agent` },
            { excludeUserId: ctx.userId, dedupeKey: attempt.id }
          );
        } catch {
          /* best-effort */
        }
      }
      return ok({
        caseId: current.id,
        attemptId: attempt.id,
        status: nextStatus,
        channel: "sms",
        deliveryConfidence: attempt.deliveryConfidence,
      });
    } catch (e) {
      if (e instanceof SmsPolicyError) {
        audit(ctx, "tahsilat.sms.blocked", current.id, {
          code: e.code,
          reason: e.message === "SMS test allowlist blocked" ? "test_allowlist_blocked" : "policy",
        });
        return fail(e.code === "FORBIDDEN" ? "FORBIDDEN" : "VALIDATION_ERROR", e.message);
      }
      return fail("INTERNAL_ERROR", e instanceof Error ? e.message : "SMS gönderilemedi");
    }
  }

  if (input.channel === "whatsapp") {
    const transport = getWhatsAppTransport();
    const realProvider = transport.name !== "console";
    if (realProvider && e164.ok && !input.markManualPending) {
      const result = await transport.sendText({ to: e164.e164.replace(/^\+/, ""), text: body });
      const attempt: FollowUpAttempt = {
        ...attemptBase,
        status: result.ok ? "sent" : "failed",
        providerMessageId: result.messageId,
        errorSummary: result.ok ? undefined : "WhatsApp gönderilemedi",
        deliveryConfidence: result.ok ? "provider_accepted" : "none",
        updatedAt: new Date().toISOString(),
      };
      await recordFollowUpAttempt(ctx.tenantId, current.id, attempt);
      await transitionFollowUpCase({
        tenantId: ctx.tenantId,
        caseId: current.id,
        to: result.ok ? "sent" : "failed",
        actorUserId: ctx.userId,
        reason: "whatsapp_send",
        patch: { selectedChannel: "whatsapp", sentAt: result.ok ? now : current.sentAt },
      });
      audit(ctx, result.ok ? "tahsilat.wa.sent" : "tahsilat.wa.failed", current.id, {
        provider: transport.name,
      });
      return ok({
        caseId: current.id,
        attemptId: attempt.id,
        status: result.ok ? "sent" : "failed",
        channel: "whatsapp",
        deliveryConfidence: attempt.deliveryConfidence,
      });
    }
    const attempt: FollowUpAttempt = {
      ...attemptBase,
      status: "manual_send_pending",
      deliveryConfidence: "none",
      costNote: "wa.me bağlantısı teslim kanıtı taşımaz",
      updatedAt: now,
    };
    await recordFollowUpAttempt(ctx.tenantId, current.id, attempt);
    await transitionFollowUpCase({
      tenantId: ctx.tenantId,
      caseId: current.id,
      to: "sent",
      actorUserId: ctx.userId,
      reason: "whatsapp_manual_link",
      patch: { selectedChannel: "whatsapp", sentAt: now },
    });
    audit(ctx, "tahsilat.wa.manual_pending", current.id, { provider: transport.name });
    return ok({
      caseId: current.id,
      attemptId: attempt.id,
      status: "sent",
      channel: "whatsapp",
      deliveryConfidence: "none",
    });
  }

  const attempt: FollowUpAttempt = {
    ...attemptBase,
    channel: "manual",
    status: "manual_send_pending",
    deliveryConfidence: "none",
    updatedAt: now,
  };
  await recordFollowUpAttempt(ctx.tenantId, current.id, attempt);
  await transitionFollowUpCase({
    tenantId: ctx.tenantId,
    caseId: current.id,
    to: "sent",
    actorUserId: ctx.userId,
    reason: "manual_send",
    patch: { selectedChannel: "manual", sentAt: now },
  });
  audit(ctx, "tahsilat.manual.pending", current.id, {});
  return ok({
    caseId: current.id,
    attemptId: attempt.id,
    status: "sent",
    channel: "manual",
    deliveryConfidence: "none",
  });
}

export async function dismissFollowUpCaseTool(
  ctx: ServiceContext,
  input: { caseId: string }
): Promise<ServiceResult<{ caseId: string; status: string }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const current = await getFollowUpCase(ctx.tenantId, input.caseId);
  if (!current) return fail("NOT_FOUND", "Vaka bulunamadı");
  const next = await transitionFollowUpCase({
    tenantId: ctx.tenantId,
    caseId: current.id,
    to: "dismissed",
    actorUserId: ctx.userId,
    reason: "manual_dismiss",
  });
  if (!next) return fail("NOT_FOUND", "Vaka bulunamadı");
  audit(ctx, "tahsilat.case.dismiss", next.id, {});
  return ok({ caseId: next.id, status: next.status });
}

export function previewCollectionsDraft(input: {
  studentName?: string;
  parentName?: string;
  remaining: number;
  paymentStatus?: string;
  schoolName?: string;
}): { text: string; fit: ReturnType<typeof describeMessageFit> } {
  const text = buildDeterministicCollectionsDraft(input);
  return { text, fit: describeMessageFit(text) };
}

export function collectionsChannelPreview(phone: string, body: string) {
  const e164 = normalizeToE164(phone);
  const fit = describeMessageFit(body);
  return {
    e164Ok: e164.ok,
    recipientMasked: e164.ok ? maskE164(e164.e164) : null,
    ...fit,
    smsTestMode: isSmsTestMode(),
    smsConfigured: isSmsProviderConfigured(),
    costNote: "Sağlayıcıya göre değişir",
  };
}

export type { FollowUpCase };
