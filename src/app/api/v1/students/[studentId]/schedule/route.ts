import { withApiHandler } from "@/lib/api/handler";
import { getStudentScheduleTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId/schedule */
export const GET = withApiHandler(
  async ({ ctx, params, searchParams }) =>
    getStudentScheduleTool(ctx, {
      studentId: params.studentId,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    }),
  { permission: "students:read" }
);
