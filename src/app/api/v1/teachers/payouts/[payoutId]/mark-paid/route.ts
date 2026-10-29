import { withApiHandler } from "@/lib/api/handler";
import { markTeacherPayoutPaidTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/teachers/payouts/:payoutId/mark-paid { method? } — hakedişi
 * ödendi işaretler (tutar değişmez). Audit log'ludur (tool içi).
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN (+ kurum hakediş politikası).
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    markTeacherPayoutPaidTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      payoutId: params.payoutId,
    }),
  { permission: "payments:write" }
);
