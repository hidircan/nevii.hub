import { withApiHandler } from "@/lib/api/handler";
import { getStudentProfileTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/students/:studentId — tek öğrenci profili (mobil öğrenci detay ekranının ana çağrısı). */
export const GET = withApiHandler(
  async ({ ctx, params }) => getStudentProfileTool(ctx, { studentId: params.studentId }),
  { permission: "students:read" }
);
