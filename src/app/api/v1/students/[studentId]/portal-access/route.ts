import { withApiHandler } from "@/lib/api/handler";
import { getStudentPortalAccessTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/portal-access — öğrencinin portal
 * hesapları (SELF + GUARDIAN, davet/aktif/revoked durumlarıyla).
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN (tool katmanında da zorlanır).
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => getStudentPortalAccessTool(ctx, { studentId: params.studentId }),
  { permission: "students:read" }
);
