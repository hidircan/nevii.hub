import { withApiHandler } from "@/lib/api/handler";
import { decideLeaveRequestTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/leave/:leaveId/decide { status: approved|rejected } —
 * izin onayı/reddi. Audit log'ludur. Yalnız kurum sahibi (tool kapısı).
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    decideLeaveRequestTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      leaveId: params.leaveId,
    }),
  { permission: "teachers:write" }
);
