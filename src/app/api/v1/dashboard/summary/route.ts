import { withApiHandler } from "@/lib/api/handler";
import { getDashboardSummaryTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/dashboard/summary — yönetici gün özeti (Özet sekmesi +
 * İşlemler rozetleri). Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const GET = withApiHandler(async ({ ctx }) => getDashboardSummaryTool(ctx), {
  permission: "students:write",
});
