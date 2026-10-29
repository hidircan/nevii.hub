import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import {
  listMemoriesForAdmin,
  deleteMemory,
  rememberFact,
} from "@/lib/ai/memory";
import { criticalDeleteFields, guardCriticalDelete } from "@/lib/services/tools";
import { recordAuditLog } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/** GET /api/v1/ai/memory — list tenant memories (admin) */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => {
    const limit = Number(searchParams.get("limit") || 100);
    const memories = await listMemoriesForAdmin(
      ctx.tenantId,
      Math.min(Math.max(limit, 1), 300)
    );
    return fromServiceResult({ ok: true, data: { memories } });
  },
  { permission: "tools:catalog" }
);

const postSchema = z.object({
  scope: z.enum(["conversation", "user", "tenant", "workflow"]),
  scopeKey: z.string().min(1),
  kind: z.enum([
    "preference",
    "recurring_request",
    "teacher_preference",
    "parent_preference",
    "workflow_outcome",
    "fact",
    "summary",
  ]),
  content: z.string().min(1).max(2000),
});

/** POST /api/v1/ai/memory — manual memory write (still tenant-scoped) */
export const POST = withApiHandler(
  async ({ ctx, body }) => {
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", "Invalid memory payload", parsed.error.flatten());
    }
    // Force tenant from JWT context
    const scopeKey =
      parsed.data.scope === "tenant"
        ? ctx.tenantId
        : parsed.data.scope === "user"
          ? ctx.userId
          : parsed.data.scopeKey;

    const memory = await rememberFact({
      ctx,
      scope: parsed.data.scope,
      scopeKey,
      kind: parsed.data.kind,
      content: parsed.data.content,
    });
    return fromServiceResult({ ok: true, data: { memory } });
  },
  { permission: "tools:catalog" }
);

const deleteSchema = z.object({ id: z.string().min(1), ...criticalDeleteFields });

/** DELETE /api/v1/ai/memory — body: { id, criticalPassword, reason } (2026-09-29: kritik şifre + gerekçe zorunlu). */
export const DELETE = withApiHandler(
  async ({ ctx, body }) => {
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail(
        "VALIDATION_ERROR",
        "Silme için kayıt, en az 5 karakterlik gerekçe ve kritik işlem şifresi gerekir; alanları doldurup tekrar deneyin."
      );
    }
    const denied = await guardCriticalDelete(
      ctx,
      { action: "ai_memory.delete", entityType: "AiMemory", entityId: parsed.data.id },
      parsed.data.criticalPassword
    );
    if (denied) return fromServiceResult(denied);
    const ok = await deleteMemory(ctx.tenantId, parsed.data.id);
    if (!ok) return jsonFail("NOT_FOUND", "Hafıza kaydı bulunamadı; başka biri silmiş olabilir. Sayfayı yenileyin.");
    await recordAuditLog({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "ai_memory.delete",
      entityType: "AiMemory",
      entityId: parsed.data.id,
      outcome: "success",
      meta: { reason: parsed.data.reason },
    });
    return fromServiceResult({ ok: true, data: { deleted: true } });
  },
  { permission: "tools:catalog" }
);
