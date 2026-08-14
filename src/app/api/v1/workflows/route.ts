import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult } from "@/lib/api/http";
import { listWorkflowsForAdmin, listWorkflowRuns } from "@/lib/workflows";

export const dynamic = "force-dynamic";

/** GET /api/v1/workflows — registry + state + recent runs */
export const GET = withApiHandler(
  async ({ ctx }) => {
    const workflows = await listWorkflowsForAdmin();
    const runs = await listWorkflowRuns(ctx.tenantId, 30);
    return fromServiceResult({
      ok: true,
      data: {
        workflows: workflows.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          intervalMinutes: w.intervalMinutes,
          enabled: w.state.enabled,
          lastRunAt: w.state.lastRunAt,
          lastSuccess: w.state.lastSuccess,
          lastError: w.state.lastError,
          runCount: w.state.runCount,
        })),
        runs,
      },
    });
  },
  { permission: "workflows:manage" }
);
