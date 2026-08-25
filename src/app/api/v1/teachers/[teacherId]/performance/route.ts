import { withApiHandler } from "@/lib/api/handler";
import { getTeacherPerformanceReportTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/teachers/:teacherId/performance?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD */
export const GET = withApiHandler(
  async ({ ctx, searchParams, params }) =>
    getTeacherPerformanceReportTool(ctx, {
      teacherId: params.teacherId,
      periodStart: searchParams.get("periodStart") || "",
      periodEnd: searchParams.get("periodEnd") || "",
    }),
  { permission: "teachers:read" }
);
