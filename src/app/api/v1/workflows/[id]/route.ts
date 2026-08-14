import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import {
  getWorkflowDefinition,
  runWorkflow,
  setWorkflowEnabled,
} from "@/lib/workflows";
import type { WorkflowId } from "@/lib/workflows";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  runNow: z.boolean().optional(),
});

/**
 * PATCH /api/v1/workflows/:id — enable/disable or run now.
 *
 * `enabled` is a GLOBAL, cross-tenant toggle (src/lib/workflows/state.ts has no
 * tenantId — it's a platform-wide automation switch, not a per-school setting).
 * Restricted to SUPER_ADMIN only, so a SCHOOL_ADMIN of one tenant can't disable
 * another tenant's automation. `runNow` triggers a single tenant-scoped run
 * (runWorkflow(id, ctx.tenantId)) and stays available to SCHOOL_ADMIN too.
 */
export const PATCH = withApiHandler(
  async ({ ctx, params, body }) => {
    const id = params.id as WorkflowId;
    if (!getWorkflowDefinition(id)) {
      return jsonFail("NOT_FOUND", `Unknown workflow: ${id}`);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten());
    }

    let state = null;
    if (typeof parsed.data.enabled === "boolean") {
      if (ctx.role !== "SUPER_ADMIN") {
        return jsonFail("FORBIDDEN", "Yalnızca SUPER_ADMIN global otomasyon anahtarını değiştirebilir.");
      }
      state = await setWorkflowEnabled(id, parsed.data.enabled);
    }

    let run = null;
    if (parsed.data.runNow) {
      run = await runWorkflow(id, ctx.tenantId);
    }

    return fromServiceResult({
      ok: true,
      data: { id, state, run },
    });
  },
  { permission: "workflows:manage" }
);
