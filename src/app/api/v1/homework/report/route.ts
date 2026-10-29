import { withApiHandler } from "@/lib/api/handler";
import { getHomeworkReportTool } from "@/lib/services/admin-lists";

export const dynamic = "force-dynamic";

/** GET /api/v1/homework/report — kurum ödev raporu. Yalnız SCHOOL_ADMIN/SUPER_ADMIN. */
export const GET = withApiHandler(async ({ ctx }) => getHomeworkReportTool(ctx), {
  permission: "students:write",
});
