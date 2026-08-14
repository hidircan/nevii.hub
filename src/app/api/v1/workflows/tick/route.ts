import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { tickWorkflows } from "@/lib/workflows";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/workflows/tick
 * Run all due enabled workflows (call from cron / external scheduler).
 */
export const POST = withApiHandler(
  async ({ ctx }) => {
    const result = await tickWorkflows(ctx.tenantId);
    return fromServiceResult({
      ok: true,
      data: {
        ran: result.ran,
        count: result.results.length,
        results: result.results.map((r) => ({
          workflowId: r.workflowId,
          success: r.success,
          durationMs: r.durationMs,
          steps: r.steps.length,
          error: r.error,
        })),
      },
    });
  },
  { permission: "workflows:manage" }
);
