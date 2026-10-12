import { withApiHandler } from "@/lib/api/handler";
import { getCollectionSummaryTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/payments/summary — tahsilat özeti (bugün/ay/bekleyen/
 * gecikmiş). Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const GET = withApiHandler(async ({ ctx }) => getCollectionSummaryTool(ctx), {
  permission: "payments:write",
});
