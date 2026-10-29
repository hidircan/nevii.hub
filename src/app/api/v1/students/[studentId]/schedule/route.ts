import { withApiHandler } from "@/lib/api/handler";
import { getStudentScheduleTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId/schedule?from=&to=&limit= (limit varsayılan 500, maks 2000) */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) =>
    getStudentScheduleTool(ctx, {
      studentId: params.studentId,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    }),
  { permission: "students:read" }
);
