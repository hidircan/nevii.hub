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
import {
  BULK_SELECTABLE_STATUSES,
  CommunicationTransitionError,
  canTransitionCommunication,
  type CommunicationStatus,
} from "./status";
import {
  toPublicCommunicationMessage,
  type CommunicationChannel,
  type CommunicationMessage,
  type CommunicationMessageType,
  type CommunicationRecipientType,
  type CommunicationResourceType,
  type PublicCommunicationMessage,
} from "./types";
import {
  LESSON_PLAN_PARENT_TEMPLATE,
  LESSON_PLAN_TEACHER_TEMPLATE,
  LESSON_UPDATE_PARENT_TEMPLATE,
  LESSON_UPDATE_TEACHER_TEMPLATE,
  renderLessonPlanTemplate,
  type LessonPlanTemplateVars,
} from "./lesson-plan-templates";
import { DEFAULT_APP_TIMEZONE, formatDateTr, toZonedYmd, zonedHm } from "../timezone";
import { TEMPLATE_CATALOG } from "../whatsapp-templates";
import { isEmailProviderConfigured } from "../email/config";

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
  /** Veli/öğrenci iletişim izni kapalıysa taslak `blocked` düşer (kayıt yine oluşur, kaybolmaz). */
  optOut?: boolean;
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
  const blockedCheck = evaluateBlockedState({ channel: input.channel, phone: input.recipientPhone, optOut: input.optOut });
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

/* ------------------------------------------------------------------ */
/* P1 (2026-09-11) — outbox dispatch şeridi: kuyruk → gönderim denemesi */
/* → sonuç. BU TURDA GERÇEK PROVIDER ÇAĞRISI YAPILMAZ (yasak): hazır    */
/* olmayan her şey `blocked`, hazır olan `mock_noop` ile kuyruğa döner. */
/* Asla sahte `delivered` üretilmez.                                    */
/* ------------------------------------------------------------------ */

export const LESSON_PLAN_WA_TEMPLATE_KEYS = ["lesson_plan_parent", "lesson_plan_teacher"] as const;

/** 24s müşteri-hizmetleri penceresi: inbound deposu YOKTUR (bilinçli boşluk — backlog), bu yüzden pencere her zaman KAPALI sayılır ve dışarıdan başlatılan WhatsApp gönderiminde onaylı şablon ZORUNLUDUR (Meta kuralıyla uyumlu). */
export function isWhatsAppServiceWindowOpen(): boolean {
  return false;
}

function staticCatalogKeys(): string[] {
  return TEMPLATE_CATALOG.map((t) => t.key);
}

export function approvedWhatsAppTemplateKeys(): string[] {
  return [...staticCatalogKeys(), ...LESSON_PLAN_WA_TEMPLATE_KEYS];
}

/** Render edilmemiş yer tutucu kalmış mı? (`{ad}` türü kalıntı gönderilmez.) */
const UNRENDERED_PLACEHOLDER = /\{[a-zA-ZçÇğĞıİöÖşŞüÜ_]+\}/;

export type DispatchReadiness =
  | { ready: true; address?: string }
  | { ready: false; code: string; message: string };

/**
 * Kanal-bazlı gönderim önkontrolleri (gerçek gönderime hazır akış).
 * Sıra bilinçlidir: sağlayıcı → adres → izin → şablon → pencere.
 */
export function evaluateDispatchReadiness(input: {
  channel: CommunicationChannel;
  phone: string;
  email?: string;
  optOut?: boolean;
  body: string;
  templateKey?: string;
}): DispatchReadiness {
  if (input.channel === "SMS") {
    if (!isSmsProviderConfigured() && !isSmsTestMode()) {
      return { ready: false, code: "provider_unconfigured", message: "Engellendi — SMS sağlayıcısı yapılandırılmadı." };
    }
    const e164 = normalizeToE164(input.phone || "");
    if (!e164.ok) return { ready: false, code: "invalid_phone", message: "Engellendi — Alıcı için geçerli telefon numarası yok." };
    if (input.optOut) return { ready: false, code: "opt_out", message: "Engellendi — Alıcı için iletişim izni yok." };
    return { ready: true, address: e164.e164 };
  }
  if (input.channel === "WHATSAPP") {
    const transport = getWhatsAppTransport();
    if (transport.name === "console") {
      return { ready: false, code: "provider_unconfigured", message: "Engellendi — WhatsApp entegrasyonu yapılandırılmadı." };
    }
    const e164 = normalizeToE164(input.phone || "");
    if (!e164.ok) return { ready: false, code: "invalid_phone", message: "Engellendi — Alıcı için geçerli WhatsApp numarası yok." };
    if (input.optOut) return { ready: false, code: "opt_out", message: "Engellendi — Alıcı için WhatsApp iletişim izni yok." };
    if (UNRENDERED_PLACEHOLDER.test(input.body || "")) {
      return { ready: false, code: "template_fields", message: "Engellendi — WhatsApp şablon alanları eksik veya geçersiz." };
    }
    if (!isWhatsAppServiceWindowOpen()) {
      const approved = approvedWhatsAppTemplateKeys();
      if (!input.templateKey) {
        return { ready: false, code: "window_closed", message: "Engellendi — 24 saatlik müşteri hizmetleri penceresi kapalı; uygun şablon gerekir." };
      }
      if (!approved.includes(input.templateKey)) {
        return { ready: false, code: "template_missing", message: "Engellendi — Onaylı WhatsApp şablonu bulunamadı." };
      }
    }
    return { ready: true, address: e164.e164 };
  }
  // EMAIL
  if (!isEmailProviderConfigured()) {
    return { ready: false, code: "provider_unconfigured", message: "Engellendi — E-posta sağlayıcısı yapılandırılmadı." };
  }
  const address = (input.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
    return { ready: false, code: "invalid_email", message: "Engellendi — Alıcı için geçerli e-posta adresi yok." };
  }
  if (input.optOut) return { ready: false, code: "opt_out", message: "Engellendi — Alıcı için iletişim izni yok." };
  return { ready: true, address };
}

async function resolveDispatchContact(
  tenantId: string,
  message: CommunicationMessage
): Promise<{ optOut: boolean; email?: string }> {
  try {
    const { readReferenceData } = await import("../store");
    const data = await readReferenceData();
    if (message.recipientType === "TEACHER") {
      const teacher = data.teachers.find((t) => t.id === message.recipientId);
      // Öğretmen için izin deposu YOKTUR (bilinçli boşluk — backlog): açık
      // opt-out kaydı yoksa engelleme üretilmez, e-posta öğretmen kaydından.
      return { optOut: false, email: teacher?.email };
    }
    const student = data.students.find((s) => s.id === message.recipientId);
    if (student) return { optOut: !!student.communicationOptOut, email: student.email };
  } catch {
    // best-effort — kayıt okunamazsa engelleme üretilmez.
  }
  return { optOut: false };
}

export type DispatchOutcome =
  | { ok: true; status: "queued"; note: string }
  | { ok: false; code: string; message: string };

/**
 * Tek mesaj dispatch denemesi: `approved`/`queued`/`failed` durumundan
 * `sending`e geçirir, hazır değilse `blocked`e düşürür, hazırsa BU TURDA
 * gerçek gönderim YAPMADAN `queued`e döndürür (`mock_noop` — sahte
 * `delivered` YOK). Her deneme audit'e ve `events`e işlenir.
 */
export async function dispatchCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage; outcome: DispatchOutcome }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı");
  if (current.status !== "approved" && current.status !== "queued" && current.status !== "failed") {
    return fail("VALIDATION_ERROR", `Bu durumda gönderim başlatılamaz (${current.status}). Önce onaylayıp kuyruğa alın.`);
  }

  const attemptCount = current.attemptCount + 1;
  // 11. tur iş #6 — durum makinesi reddi YAKALANIR: ham 500 yerine anlaşılır
  // VALIDATION_ERROR döner (kullanıcının gördüğü "Gönderim denemesi başarısız"ın kökü buydu).
  let sending;
  try {
    sending = await transitionCommunicationMessage({
      tenantId: ctx.tenantId,
      id: current.id,
      to: "sending",
      actorUserId: ctx.userId,
      reason: "dispatch_attempt",
      patch: { attemptCount },
    });
  } catch (e) {
    if (e instanceof CommunicationTransitionError) return fail("VALIDATION_ERROR", e.message);
    throw e;
  }
  if (!sending) return fail("NOT_FOUND", "Mesaj bulunamadı");
  audit(ctx, "communication.dispatch_attempt", sending.id, { attempt: attemptCount, channel: sending.channel });

  const contact = await resolveDispatchContact(ctx.tenantId, sending);
  const readiness = evaluateDispatchReadiness({
    channel: sending.channel,
    phone: sending.recipientPhone,
    email: contact.email,
    optOut: contact.optOut,
    body: sending.approvedBodySnapshot ?? sending.draftBody,
    templateKey: sending.templateKey,
  });

  if (!readiness.ready) {
    const blocked = await transitionCommunicationMessage({
      tenantId: ctx.tenantId,
      id: sending.id,
      to: "blocked",
      actorUserId: ctx.userId,
      reason: "dispatch_blocked",
      patch: { blockedReasonCode: readiness.code, blockedReasonMessage: readiness.message, providerResultCode: readiness.code, providerResultSummary: readiness.message },
    });
    if (!blocked) return fail("NOT_FOUND", "Mesaj bulunamadı");
    audit(ctx, "communication.dispatch_blocked", blocked.id, { code: readiness.code });
    return ok({ message: toPublicCommunicationMessage(blocked), outcome: { ok: false, code: readiness.code, message: readiness.message } });
  }

  // Hazır ama BU TURDA gerçek provider çağrısı yasak → kuyruğa dönüş.
  const note = "Kuyrukta — Local/mock ortamda gerçek gönderim yapılmadı.";
  const back = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: sending.id,
    to: "queued",
    actorUserId: ctx.userId,
    reason: "dispatch_mock_noop",
    patch: { providerResultCode: "mock_noop", providerResultSummary: note },
  });
  if (!back) return fail("NOT_FOUND", "Mesaj bulunamadı");
  audit(ctx, "communication.dispatch_mock_noop", back.id, { channel: back.channel });
  return ok({ message: toPublicCommunicationMessage(back), outcome: { ok: true, status: "queued", note } });
}

/**
 * 11. tur iş #2/#6 — wa.me manuel akışı, 1. adım: "WhatsApp'ta aç".
 *
 * Onaylı/queued WhatsApp mesajı için wa.me derin bağlantısını üretir ve mesajı
 * `manual_send_pending` durumuna alır (aktör + zaman OLAYA yazılır — audit).
 * Gerçek teslimi DOĞRULAMAZ: kullanıcı WhatsApp'ta gönderdikten sonra
 * `markCommunicationDeliveredTool` ile ayrıca işaretler. Aynı durumdaysa
 * olayı TEKRARLAMADAN mevcut kaydı döner (çift tıklama güvenliği).
 */
export function buildWhatsAppDeepLink(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function markCommunicationManualSendTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage; waUrl: string }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı.");
  if (current.channel !== "WHATSAPP") {
    return fail("VALIDATION_ERROR", "Manuel WhatsApp akışı yalnız WhatsApp mesajlarında kullanılır.");
  }
  if (current.status === "manual_send_pending") {
    const body = current.approvedBodySnapshot ?? current.draftBody;
    return ok({
      message: toPublicCommunicationMessage(current),
      waUrl: buildWhatsAppDeepLink(current.recipientPhone, body),
    });
  }
  if (current.status !== "approved" && current.status !== "queued") {
    return fail("VALIDATION_ERROR", `Bu mesaj manuel gönderime uygun değil (durum: ${current.status}).`);
  }
  try {
    const message = await transitionCommunicationMessage({
      tenantId: ctx.tenantId,
      id: current.id,
      to: "manual_send_pending",
      actorUserId: ctx.userId,
      reason: "manual_wa_opened",
      patch: { providerResultCode: "wa.me-manual", providerResultSummary: "WhatsApp'ta açıldı — gönderim kullanıcı onayı bekliyor." },
    });
    if (!message) return fail("NOT_FOUND", "Mesaj bulunamadı.");
    audit(ctx, "communication.manual_send_opened", message.id, { channel: current.channel });
    const body = message.approvedBodySnapshot ?? message.draftBody;
    return ok({ message: toPublicCommunicationMessage(message), waUrl: buildWhatsAppDeepLink(message.recipientPhone, body) });
  } catch (e) {
    if (e instanceof CommunicationTransitionError) return fail("VALIDATION_ERROR", e.message);
    throw e;
  }
}

/**
 * 11. tur iş #2/#6 — wa.me manuel akışı, 2. adım: "Gönderdim olarak işaretle".
 *
 * YALNIZCA kullanıcının açık onayıyla (`confirm: true`) `manual_send_pending`
 * → `delivered` geçişi yapar; aktör + zaman olaya yazılır. Burası teknik teslim
 * doğrulaması DEĞİLDİR — "kullanıcı WhatsApp'ta gönderdiğini onayladı" kaydıdır
 * ve UI'da öyle gösterilir ("kullanıcı onaylı gönderim"). Aynı durumdaysa olayı tekrarlamaz.
 */
export async function markCommunicationDeliveredTool(
  ctx: ServiceContext,
  input: { id: string; confirm: true }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  if (input.confirm !== true) {
    return fail("VALIDATION_ERROR", "Gönderim işareti için açık onay (confirm) gerekir.");
  }
  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı.");
  if (current.status === "delivered") {
    return ok({ message: toPublicCommunicationMessage(current) });
  }
  if (current.status !== "manual_send_pending") {
    return fail(
      "VALIDATION_ERROR",
      "Yalnız manuel gönderim bekleyen (WhatsApp'ta açılmış) mesaj gönderildi olarak işaretlenebilir."
    );
  }
  try {
    const message = await transitionCommunicationMessage({
      tenantId: ctx.tenantId,
      id: current.id,
      to: "delivered",
      actorUserId: ctx.userId,
      reason: "manual_wa_confirmed",
      patch: { providerResultCode: "wa.me-manual-confirmed", providerResultSummary: "Kullanıcı WhatsApp'ta gönderdiğini onayladı (teknik teslim doğrulaması değil)." },
    });
    if (!message) return fail("NOT_FOUND", "Mesaj bulunamadı.");
    audit(ctx, "communication.manual_send_confirmed", message.id, {});
    return ok({ message: toPublicCommunicationMessage(message) });
  } catch (e) {
    if (e instanceof CommunicationTransitionError) return fail("VALIDATION_ERROR", e.message);
    throw e;
  }
}

/**
 * Ders detayındaki "Bilgilendirme geçmişi" — tenant kapsamlı, maskeli satırlar.
 * Personel görebilir; öğretmen yalnız KENDİ derslerini (teacherId eşleşmesi).
 */
export async function listLessonCommunicationMessagesTool(
  ctx: ServiceContext,
  input: { lessonId: string }
): Promise<ServiceResult<{ messages: PublicCommunicationMessage[] }>> {
  if (!input.lessonId) return fail("VALIDATION_ERROR", "Ders kimliği gerekli.");
  const staff = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!staff.ok && ctx.role !== "TEACHER") return fail("FORBIDDEN", staff.message);
  if (ctx.role === "TEACHER") {
    // Öğretmen ctx'i tenant'a bağlıdır; sahiplik teacherId eşleşmesidir
    // (canAccessStudent TEACHER dalıyla aynı kural). Satırlar zaten
    // tenant kapsamlı listelenir (aşağıda).
    // DB egress (2026-10-18) — sahiplik için tek ders satırı yeter (tam kurum okuması değil).
    const { readLessonById } = await import("../store");
    const lesson = await readLessonById(input.lessonId);
    if (!lesson || lesson.teacherId !== ctx.teacherId) {
      return fail("FORBIDDEN", "Bu dersin bilgilendirme geçmişini görme yetkiniz yok.");
    }
  }
  const rows = await listCommunicationMessages(ctx.tenantId);
  return ok({
    messages: rows
      .filter((r) => r.resourceType === "lesson" && r.resourceId === input.lessonId)
      .map(toPublicCommunicationMessage),
  });
}

/** Onaylı mesajı kuyruğa alır (`approved` → `queued`). */
export async function enqueueCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı");
  if (!canTransitionCommunication(current.status, "queued")) {
    return fail("VALIDATION_ERROR", `Bu durumda kuyruğa alınamaz (${current.status}).`);
  }
  const next = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: current.id,
    to: "queued",
    actorUserId: ctx.userId,
    reason: "enqueue",
  });
  if (!next) return fail("NOT_FOUND", "Mesaj bulunamadı");
  audit(ctx, "communication.enqueue", next.id, { channel: next.channel });
  return ok({ message: toPublicCommunicationMessage(next) });
}

/**
 * "Onayla ve kuyruğa al" — TEK görünür aksiyon: onaylar (snapshot donar) ve
 * kuyruğa geçirir. Sonuç toast + liste durumu + audit ile görünür.
 */
export async function approveAndEnqueueCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const approved = await approveOneCommunicationMessage(ctx, input.id);
  if (!approved.ok) return fail(approved.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", approved.reason);
  const queued = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: approved.message.id,
    to: "queued",
    actorUserId: ctx.userId,
    reason: "approve_and_enqueue",
  });
  if (!queued) return fail("NOT_FOUND", "Mesaj bulunamadı");
  audit(ctx, "communication.approve_enqueue", queued.id, { channel: queued.channel });
  return ok({ message: toPublicCommunicationMessage(queued) });
}

/** Başarısız/engellenmiş mesajı güvenli biçimde yeniden kuyruğa alır. */
export async function retryCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı");
  if (current.status !== "failed" && current.status !== "blocked") {
    return fail("VALIDATION_ERROR", `Yalnızca başarısız/engellenmiş mesaj yeniden denenebilir (${current.status}).`);
  }
  const next = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: current.id,
    to: "queued",
    actorUserId: ctx.userId,
    reason: "retry",
    patch: { blockedReasonCode: undefined, blockedReasonMessage: undefined },
  });
  if (!next) return fail("NOT_FOUND", "Mesaj bulunamadı");
  audit(ctx, "communication.retry", next.id, { from: current.status });
  return ok({ message: toPublicCommunicationMessage(next) });
}

/** Henüz gönderilmemiş mesajı iptal eder — gönderilmiş kayıt ASLA iptal edilmez. */
export async function cancelCommunicationMessageTool(
  ctx: ServiceContext,
  input: { id: string }
): Promise<ServiceResult<{ message: PublicCommunicationMessage }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const current = await getCommunicationMessage(ctx.tenantId, input.id);
  if (!current) return fail("NOT_FOUND", "Mesaj bulunamadı");
  if (!canTransitionCommunication(current.status, "cancelled")) {
    return fail("VALIDATION_ERROR", `Bu durumda iptal edilemez (${current.status}). Gönderilmiş kayıtlar iptal edilmiş gibi gösterilmez.`);
  }
  const next = await transitionCommunicationMessage({
    tenantId: ctx.tenantId,
    id: current.id,
    to: "cancelled",
    actorUserId: ctx.userId,
    reason: "cancel",
  });
  if (!next) return fail("NOT_FOUND", "Mesaj bulunamadı");
  audit(ctx, "communication.cancel", next.id, { from: current.status });
  return ok({ message: toPublicCommunicationMessage(next) });
}

export { uid as generateCommunicationId };

/* ------------------------------------------------------------------ */
/* P1 (2026-09-12) — daraltılmış gelen WhatsApp listesi. Inbound      */
/* deposu webhook→AI-sohbet hattıdır (`wa:<telefon>` başlıklı        */
/* Conversation); bu liste admin-only, tenant-scoped, salt-okunur bir */
/* özettedir: telefon maskeli, yalnızca SON GELEN mesajdan 120        */
/* karakterlik alıntı, en yeni 50 kayıt. Yanıt/operasyon YOK.         */
/* ------------------------------------------------------------------ */

export const MAX_WHATSAPP_INBOUND_LIST = 50;
const INBOUND_EXCERPT_LEN = 120;

export type WhatsAppInboundSummary = {
  id: string;
  phoneMasked: string;
  lastInboundExcerpt: string;
  messageCount: number;
  updatedAt: string;
};

export async function listWhatsAppInboundTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ conversations: WhatsAppInboundSummary[] }>> {
  const auth = assertAdmin(ctx);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);

  const { listTenantConversations } = await import("../ai/conversations");
  const { maskPhoneDisplay } = await import("./types");
  const all = await listTenantConversations(ctx.tenantId);
  const conversations = all
    .filter((c) => c.title.startsWith("wa:"))
    .slice(0, MAX_WHATSAPP_INBOUND_LIST)
    .map((c) => {
      const inbound = [...c.messages].reverse().find((m) => m.role === "user");
      return {
        id: c.id,
        phoneMasked: maskPhoneDisplay(c.title.slice("wa:".length)),
        lastInboundExcerpt: (inbound?.content ?? "").slice(0, INBOUND_EXCERPT_LEN),
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      };
    });
  return ok({ conversations });
}

/**
 * Telafi dersi planlandığında veli için SMS + WhatsApp CommunicationMessage
 * taslaklarını idempotent biçimde oluşturur (FAZ6). `lesson.id` + alıcı +
 * kanal aynıysa ikinci çağrı (retry) yeni kayıt yaratmaz — deriveIdempotencyKey
 * zaten resourceId=lesson.id'yi anahtara dahil eder.
 */
export type LessonPlanDraftParty = {
  name: string;
  phone: string;
  studentId?: string;
  teacherId?: string;
  optOut?: boolean;
};

/**
 * P1 (2026-09-11) — ders planı oluşturulduğunda veli + öğretmen iletişim
 * kayıtları. Veli SMS+WhatsApp, öğretmen WhatsApp alır (öğretmen anlık
 * bildirimi ayrıca `notifyTeacherLessonPlanned` ile gider — çift kanal
 * şişkinliği bilinçli olarak YOK). Aynı ders+alıcı+kanal+tip için ikinci
 * çağrı yeni kayıt YARATMAZ (idempotency anahtarı). Gönderim başarısızsa
 * kayıt `failed` durumunda KALIR; mesaj gönderilmedi diye ders akışı
 * ASLA bozulmaz (çağıran best-effort try/catch ile çağırır).
 */
export async function createLessonPlanCommunicationDrafts(input: {
  tenantId: string;
  lessonId: string;
  createdBy: string;
  vars: LessonPlanTemplateVars;
  parent: LessonPlanDraftParty;
  teacher: LessonPlanDraftParty;
}): Promise<{ records: CommunicationMessage[] }> {
  const parentBody = renderLessonPlanTemplate(LESSON_PLAN_PARENT_TEMPLATE, {
    ...input.vars,
    veliAdi: input.parent.name,
  });
  const teacherBody = renderLessonPlanTemplate(LESSON_PLAN_TEACHER_TEMPLATE, {
    ...input.vars,
    ogretmenAdi: input.teacher.name,
  });
  const records: CommunicationMessage[] = [];
  if (parentBody.ok) {
    const base = {
      tenantId: input.tenantId,
      recipientType: "PARENT" as const,
      recipientId: input.parent.studentId ?? input.lessonId,
      recipientName: input.parent.name,
      recipientPhone: input.parent.phone,
      messageType: "LESSON" as const,
      resourceType: "lesson" as const,
      resourceId: input.lessonId,
      body: parentBody.body,
      createdBy: input.createdBy,
      optOut: input.parent.optOut,
      idempotencySuffix: "plan",
    };
    const sms = await createCommunicationDraft({ ...base, channel: "SMS" });
    const whatsapp = await createCommunicationDraft({ ...base, channel: "WHATSAPP" });
    records.push(sms.record, whatsapp.record);
  }
  if (teacherBody.ok) {
    const wa = await createCommunicationDraft({
      tenantId: input.tenantId,
      recipientType: "TEACHER",
      recipientId: input.teacher.teacherId ?? input.lessonId,
      recipientName: input.teacher.name,
      recipientPhone: input.teacher.phone,
      channel: "WHATSAPP",
      messageType: "LESSON",
      resourceType: "lesson",
      resourceId: input.lessonId,
      body: teacherBody.body,
      createdBy: input.createdBy,
      idempotencySuffix: "plan",
    });
    records.push(wa.record);
  }
  return { records };
}

/**
 * 11. tur iş #2 — ders GÜNCELLEME taslakları (eski→yeni).
 *
 * Plan akışıyla AYNI iskelet: veliye SMS+WhatsApp, (yeni) öğretmene WhatsApp.
 * Farklar: gövde güncelleme şablonundan (`{degisiklik}` zorunlu), idempotency
 * anahtarı YENİ değerlerden türetilir (aynı güncelleme tekrarlanırsa taslak
 * çoğalmaz; FARKLI bir güncelleme yeni taslak üretir), eski öğretmene taslak
 * YOKTUR (artık onun dersi değil; uygulama-içi bildirim zaten gider).
 * Geçersiz telefon/opt-out → taslak `blocked` düşer, ders akışı etkilenmez.
 */
export async function createLessonUpdateCommunicationDrafts(input: {
  tenantId: string;
  lessonId: string;
  createdBy: string;
  vars: LessonPlanTemplateVars;
  degisiklik: string;
  idempotencySuffix: string;
  parent: LessonPlanDraftParty;
  teacher: LessonPlanDraftParty | null;
}): Promise<{ records: CommunicationMessage[] }> {
  const parentBody = renderLessonPlanTemplate(LESSON_UPDATE_PARENT_TEMPLATE, {
    ...input.vars,
    veliAdi: input.parent.name,
    degisiklik: input.degisiklik,
  });
  const teacherBody = input.teacher
    ? renderLessonPlanTemplate(LESSON_UPDATE_TEACHER_TEMPLATE, {
        ...input.vars,
        ogretmenAdi: input.teacher.name,
        degisiklik: input.degisiklik,
      })
    : { ok: false as const, message: "Öğretmen yok" };
  const records: CommunicationMessage[] = [];
  if (parentBody.ok) {
    const base = {
      tenantId: input.tenantId,
      recipientType: "PARENT" as const,
      recipientId: input.parent.studentId ?? input.lessonId,
      recipientName: input.parent.name,
      recipientPhone: input.parent.phone,
      messageType: "LESSON" as const,
      resourceType: "lesson" as const,
      resourceId: input.lessonId,
      body: parentBody.body,
      createdBy: input.createdBy,
      optOut: input.parent.optOut,
      idempotencySuffix: input.idempotencySuffix,
    };
    const sms = await createCommunicationDraft({ ...base, channel: "SMS" });
    const whatsapp = await createCommunicationDraft({ ...base, channel: "WHATSAPP" });
    records.push(sms.record, whatsapp.record);
  }
  if (teacherBody.ok && input.teacher) {
    const wa = await createCommunicationDraft({
      tenantId: input.tenantId,
      recipientType: "TEACHER",
      recipientId: input.teacher.teacherId ?? input.lessonId,
      recipientName: input.teacher.name,
      recipientPhone: input.teacher.phone,
      channel: "WHATSAPP",
      messageType: "LESSON",
      resourceType: "lesson",
      resourceId: input.lessonId,
      body: teacherBody.body,
      createdBy: input.createdBy,
      idempotencySuffix: input.idempotencySuffix,
    });
    records.push(wa.record);
  }
  return { records };
}

/**
 * 11. tur iş #2 — güncelleme kancası (best-effort, asla fırlatmaz).
 *
 * Ders taşıma (tarih/saat) ve öğretmen/oda/şube ataması SONRASI çağrılır;
 * gerçekten değişen parçalardan `{degisiklik}` özeti kurar, YENİ değerlerle
 * veli (SMS+WA) + güncel öğretmen (WA) taslakları üretir. Değişiklik yoksa
 * taslak ÜRETİLMEZ. Ders akışı (taşıma/atama) bu fonksiyonun sonucundan
 * etkilenmez — hata olursa sessizce yutulur (ders zaten güncellendi).
 */
export async function queueLessonUpdateDraftsBestEffort(input: {
  tenantId: string;
  actorUserId: string;
  lessonId: string;
  previous: { startAt: string; teacherId: string; roomId: string; branchId: string; durationMinutes?: number };
}): Promise<void> {
  try {
    // DB egress (2026-10-18) — her ders taşıma/atama sonrası çalışır: tek ders satırı + referans veri (öğrenci,
    // öğretmen, oda, şube, kurum adı) yeter; önceden tam kurum verisi okunuyordu.
    const { readLessonById, readReferenceData } = await import("../store");
    const [lesson, data] = await Promise.all([readLessonById(input.lessonId), readReferenceData()]);
    if (!lesson) return;
    const student = data.students.find((s) => s.id === lesson.studentId);
    if (!student) return;
    const teacherName = (id: string) => data.teachers.find((t) => t.id === id)?.name ?? "—";
    const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? "—";
    const branchName = (id: string) => data.settings.branches.find((b) => b.id === id)?.shortName ?? "—";
    const oldDay = toZonedYmd(new Date(input.previous.startAt), DEFAULT_APP_TIMEZONE);
    const newDay = toZonedYmd(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE);
    const oldHm = zonedHm(new Date(input.previous.startAt), DEFAULT_APP_TIMEZONE);
    const newHm = zonedHm(new Date(lesson.startAt), DEFAULT_APP_TIMEZONE);
    const parts: string[] = [];
    if (oldDay !== newDay) parts.push(`tarih ${formatDateTr(input.previous.startAt)} → ${formatDateTr(lesson.startAt)}`);
    if (oldHm !== newHm) parts.push(`saat ${oldHm} → ${newHm}`);
    if (input.previous.teacherId !== lesson.teacherId) {
      parts.push(`öğretmen ${teacherName(input.previous.teacherId)} → ${teacherName(lesson.teacherId)}`);
    }
    if (input.previous.branchId !== lesson.branchId) {
      parts.push(`şube ${branchName(input.previous.branchId)} → ${branchName(lesson.branchId)}`);
    }
    if (input.previous.roomId !== lesson.roomId) {
      parts.push(`oda ${roomName(input.previous.roomId)} → ${roomName(lesson.roomId)}`);
    }
    // Lesson modelinde süre alanı yok — başlangıç/bitişten türetilir.
    const newDuration = Math.round(
      (new Date(lesson.endAt).getTime() - new Date(lesson.startAt).getTime()) / 60000
    );
    const prevDuration = input.previous.durationMinutes;
    if (prevDuration !== undefined && prevDuration !== newDuration) {
      parts.push(`süre ${prevDuration} → ${newDuration} dk`);
    }
    if (parts.length === 0) return;
    const teacher = data.teachers.find((t) => t.id === lesson.teacherId) ?? null;
    await createLessonUpdateCommunicationDrafts({
      tenantId: input.tenantId,
      lessonId: lesson.id,
      createdBy: input.actorUserId,
      vars: {
        veliAdi: student.parentName || student.name,
        ogrenciAdi: student.name,
        ogretmenAdi: teacher?.name ?? "Öğretmen",
        dersAdi: lesson.instrument,
        tarih: formatDateTr(lesson.startAt),
        saat: newHm,
        sube: branchName(lesson.branchId),
        kurum: data.settings.name ?? "NeviiHub",
        degisiklik: "",
      },
      degisiklik: parts.join("; "),
      idempotencySuffix: `update:${lesson.startAt}:${lesson.teacherId}:${lesson.roomId}:${lesson.branchId}`,
      parent: {
        name: student.parentName || student.name || "Veli",
        phone: student.parentPhone || student.phone || "",
        studentId: student.id,
        optOut: student.communicationOptOut,
      },
      teacher: teacher ? { name: teacher.name, phone: teacher.phone || "", teacherId: teacher.id } : null,
    });
  } catch {
    // best-effort — ders güncellemesi başarılı sayılır.
  }
}

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
