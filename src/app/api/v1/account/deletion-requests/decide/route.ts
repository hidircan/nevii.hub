import { withApiHandler } from "@/lib/api/handler";
import { decideAccountDeletionRequestTool } from "@/lib/services/account-deletion-tools";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/account/deletion-requests/decide { requestId, status, decisionNote? } —
 * onay/red/işlendi. Stale karar CONFLICT verir. Audit log'ludur.
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const POST = withApiHandler(
  async ({ ctx, body }) => decideAccountDeletionRequestTool(ctx, body),
  { permission: "students:write" }
);
