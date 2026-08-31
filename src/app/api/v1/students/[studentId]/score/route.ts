import { withApiHandler } from "@/lib/api/handler";
import { getStudentScoreTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId/score — genel gelişim skoru (bkz. computeStudentScore). */
export const GET = withApiHandler(
  async ({ ctx, params }) => getStudentScoreTool(ctx, { studentId: params.studentId }),
  { permission: "students:read" }
);
