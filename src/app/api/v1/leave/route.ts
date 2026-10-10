import { withApiHandler } from "@/lib/api/handler";
import { listLeaveTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/leave?staffId= — izin talepleri. Gerçek kapı tool içindedir
 * (`requireStaffSensitiveAccess`: yalnız kurum sahibi / SUPER_ADMIN).
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listLeaveTool(ctx, { staffId: searchParams.get("staffId") || undefined }),
  { permission: "teachers:write" }
);
