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
 * POST /api/ai/insights
 *
 * Read-only, no-approval capabilities only (`requiresApproval:false`):
 * attendanceDailySummary, makeupSlotSuggestion, collectionsROIReport,
 * teacherPerformanceScore, attendanceRiskAssessment.
 * Message-drafting/sending capabilities live in `/api/ai/collections*`,
 * never here — this route always returns `status:"completed"`.
 *
 * `tenantId`/`callerRole` come ONLY from the authenticated session, never
 * the request body — same fail-closed contract as `/api/ai/collections`.
 */
const INSIGHT_CAPABILITIES = [
  "attendanceDailySummary",
  "makeupSlotSuggestion",
  "collectionsROIReport",
  "teacherPerformanceScore",
  "attendanceRiskAssessment",
] as const;

const bodySchema = z.object({
  capabilityId: z.enum(INSIGHT_CAPABILITIES),
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

  const apiContext = { callerRole: ctx.role, tenantId: ctx.tenantId, operation: "insights" };
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

    await recordAiAuditLog({
      id: invocationId,
      tenantId: ctx.tenantId,
      capabilityId,
      callerRole: ctx.role,
      chosenProvider: execution.provider,
      usedFallback: execution.usedFallback,
      success: true,
      durationMs: Date.now() - t0,
      approvalStatus: "not_required",
    });

    return ok({ result: execution.result, status: "completed" as const, invocationId });
  } catch (error) {
    // Provider error detail is audited server-side only — never returned to the client,
    // which could leak provider identity, keys-adjacent config, or internal request shape.
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
      approvalStatus: "not_required",
    });
    return fail("INTERNAL_ERROR", "AI çağrısı başarısız oldu.", { invocationId });
  }
});
