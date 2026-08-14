import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { ok, fail } from "@/lib/services/result";
import { planAiInvocation } from "@/lib/ai/plan-invocation";
import { executeWithProvider } from "@/lib/ai/provider-bridge";
import { recordAiAuditLog } from "@/lib/ai/audit-hook";
import { getCapability, type AiCapabilityId } from "@/lib/ai/capabilities";
import { uid } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/collections
 *
 * `tenantId`/`callerRole` come ONLY from the authenticated session
 * (`withApiHandler` → `ctx`) — never from the request body. Fail-closed:
 * no `DEFAULT_TENANT_ID` fallback anywhere in this path.
 */
const COLLECTIONS_CAPABILITIES = ["collectionsIntake", "collectionsMessageDraft"] as const;

const bodySchema = z.object({
  capabilityId: z.enum(COLLECTIONS_CAPABILITIES),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

function buildPrompt(capabilityId: AiCapabilityId, payload: Record<string, unknown>): string {
  const capability = getCapability(capabilityId);
  const base = capability?.description ?? capabilityId;
  return Object.keys(payload).length > 0 ? base : `${base} (ek bağlam verilmedi)`;
}

export const POST = withApiHandler(async ({ ctx, body }) => {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Geçersiz istek gövdesi");
  }
  const { capabilityId, payload } = parsed.data;

  const apiContext = { callerRole: ctx.role, tenantId: ctx.tenantId, operation: "collections" };
  const plan = planAiInvocation(capabilityId, apiContext);
  if (!plan.allowed) {
    return fail("FORBIDDEN", plan.reason);
  }

  const invocationId = uid("aiaudit");
  const t0 = Date.now();

  try {
    const execution = await executeWithProvider(
      capabilityId,
      { prompt: buildPrompt(capabilityId, payload), context: payload },
      { ...apiContext, invocationId }
    );

    const status = plan.capability.requiresApproval ? "pending_approval" : "completed";

    // Awaited on purpose (unlike provider-bridge's own fire-and-forget write):
    // this route hands `invocationId` to the client, and the approve route
    // must be able to find this exact row — the write is guaranteed here
    // via upsert before the response goes out.
    await recordAiAuditLog({
      id: invocationId,
      tenantId: ctx.tenantId,
      capabilityId,
      callerRole: ctx.role,
      chosenProvider: execution.provider,
      usedFallback: execution.usedFallback,
      success: true,
      durationMs: Date.now() - t0,
      approvalStatus: plan.capability.requiresApproval ? "pending_approval" : "not_required",
    });

    return ok({ result: execution.result, status, invocationId });
  } catch (error) {
    await recordAiAuditLog({
      id: invocationId,
      tenantId: ctx.tenantId,
      capabilityId,
      callerRole: ctx.role,
      chosenProvider: plan.chosenProvider,
      usedFallback: false,
      success: false,
      errorMessage: error instanceof Error ? error.message : "AI çağrısı başarısız oldu.",
      durationMs: Date.now() - t0,
      approvalStatus: plan.capability.requiresApproval ? "pending_approval" : "not_required",
    });
    return fail("INTERNAL_ERROR", "AI çağrısı başarısız oldu.", { invocationId });
  }
});
