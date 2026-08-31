import { withApiHandler } from "@/lib/api/handler";
import { getStudentAttendanceSummaryTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId/attendance-summary — mobil Gelişim ekranı "Ders devam özeti". */
export const GET = withApiHandler(
  async ({ ctx, params }) => getStudentAttendanceSummaryTool(ctx, { studentId: params.studentId }),
  { permission: "students:read" }
);
