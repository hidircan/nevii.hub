import { z } from "zod";
import {
  cancelDeletionRequest,
  createDeletionRequest,
  getMyDeletionRequests,
  getOpenDeletionRequest,
  listDeletionRequests,
  setDeletionRequestStatus,
  type AccountDeletionRequest,
  type DeletionRequestStatus,
} from "../account-deletion";
import { recordAuditLog } from "../audit/log";
import { isRateLimited } from "../auth/password-reset";
import { getUserById } from "../auth/users";
import { requireRole, type ServiceContext } from "./context";
import { fail, fromZodError, ok, type ServiceResult } from "./result";

/**
 * Hesap silme talebi tool'ları (Faz 6).
 *
 * - `requestAccountDeletionTool`: girişli kullanıcı KENDİ hesabı için
 *   (rol fark etmez; `ctx.userId` otoritedir, body'den kimlik ASLA).
 *   Idempotent: açık talep varken aynı kayıt döner. Rate-limit:
 *   kullanıcı başına saatte 3 deneme.
 * - `getMyDeletionRequestTool`: kendi talepleri (durum takibi).
 * - `cancelMyDeletionRequestTool`: bekleyen talebi geri çekme.
 * - `listAccountDeletionRequestsTool` / `decideAccountDeletionRequestTool`:
 *   yalnız SCHOOL_ADMIN/SUPER_ADMIN. `processed` fiziksel silme DEĞİL —
 *   retention'a uygun işlemin tamamlandığı anlamına gelir.
 */
function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): ServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error.flatten());
  return ok(parsed.data);
}

function auditDeletion(
  ctx: ServiceContext,
  action: string,
  requestId: string,
  outcome: "success" | "denied" | "error",
  meta?: Record<string, unknown>
): void {
  void recordAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    action,
    entityType: "AccountDeletionRequest",
    entityId: requestId,
    outcome,
    ...(meta ? { meta } : {}),
  });
}

const requestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  /** Güçlü onay: istemci açık onay kutusunu işaretlemeden gönderemez. */
  confirm: z.literal(true, { message: "Silme onayı zorunludur." }),
});

export async function requestAccountDeletionTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ request: AccountDeletionRequest; created: boolean }>> {
  const v = parseOrFail(requestSchema, input);
  if (!v.ok) return v;
  if (isRateLimited(`delreq:${ctx.tenantId}:${ctx.userId}`, 3, 60 * 60 * 1000)) {
    return fail("RATE_LIMITED", "Çok fazla deneme. Lütfen bir saat sonra tekrar deneyin.");
  }
  const user = await getUserById(ctx.userId);
  if (!user || user.tenantId !== ctx.tenantId || !user.email) return fail("FORBIDDEN", "Hesap bulunamadı.");
  const { request, created } = await createDeletionRequest({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    email: user.email,
    role: ctx.role,
    ...(v.data.reason ? { reason: v.data.reason } : {}),
  });
  auditDeletion(ctx, "account.deletion_requested", request.id, "success", { created });
  return ok({ request, created });
}

export async function getMyDeletionRequestTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ open: AccountDeletionRequest | null; history: AccountDeletionRequest[] }>> {
  const [open, history] = await Promise.all([
    getOpenDeletionRequest(ctx.tenantId, ctx.userId),
    getMyDeletionRequests(ctx.tenantId, ctx.userId),
  ]);
  return ok({ open, history });
}

export async function cancelMyDeletionRequestTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ request: AccountDeletionRequest }>> {
  const request = await cancelDeletionRequest(ctx.tenantId, ctx.userId);
  if (!request) return fail("NOT_FOUND", "Geri çekilebilir bekleyen talebiniz yok.");
  auditDeletion(ctx, "account.deletion_cancelled", request.id, "success");
  return ok({ request });
}

export async function listAccountDeletionRequestsTool(
  ctx: ServiceContext
): Promise<ServiceResult<{ requests: AccountDeletionRequest[] }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  return ok({ requests: await listDeletionRequests(ctx.tenantId) });
}

const decideSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["approved", "rejected", "processed"]),
  decisionNote: z.string().trim().max(500).optional(),
});

const DECIDE_FROM: Record<string, DeletionRequestStatus[]> = {
  approved: ["pending"],
  rejected: ["pending", "approved"],
  processed: ["approved"],
};

export async function decideAccountDeletionRequestTool(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<{ request: AccountDeletionRequest }>> {
  const auth = requireRole(ctx, ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return fail("FORBIDDEN", auth.message);
  const v = parseOrFail(decideSchema, input);
  if (!v.ok) return v;

  const all = await listDeletionRequests(ctx.tenantId);
  const current = all.find((r) => r.id === v.data.requestId);
  if (!current) return fail("NOT_FOUND", "Talep bulunamadı.");
  // Stale/duplicate karar: izin verilmeyen geçiş reddedilir (örn. iki kez onay).
  if (!DECIDE_FROM[v.data.status]?.includes(current.status)) {
    return fail("CONFLICT", `Bu talep şu an "${current.status}" durumunda — "${v.data.status}" kararı verilemez.`);
  }
  const updated = await setDeletionRequestStatus(ctx.tenantId, v.data.requestId, v.data.status, {
    decidedBy: ctx.userId,
    ...(v.data.decisionNote ? { decisionNote: v.data.decisionNote } : {}),
  });
  if (!updated) return fail("NOT_FOUND", "Talep bulunamadı.");
  auditDeletion(ctx, "account.deletion_decided", updated.id, "success", {
    from: current.status,
    to: v.data.status,
  });
  return ok({ request: updated });
}
