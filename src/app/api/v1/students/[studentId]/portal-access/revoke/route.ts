import { withApiHandler } from "@/lib/api/handler";
import { revokeStudentPortalAccessTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/students/:studentId/portal-access/revoke { userId } —
 * portal erişimini iptal eder. Idempotent değildir (kayıt yoksa 404);
 * tekrar revoke zararsızdır (durum zaten revoked). Audit log'ludur.
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    revokeStudentPortalAccessTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      studentId: params.studentId,
    }),
  { permission: "students:write" }
);
