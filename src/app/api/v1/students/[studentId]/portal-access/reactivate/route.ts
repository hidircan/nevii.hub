import { withApiHandler } from "@/lib/api/handler";
import { reactivateStudentPortalAccessTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/students/:studentId/portal-access/reactivate { userId } —
 * iptal edilmiş erişimi yeniden açar (mevcut hesap, yeni kullanıcı YOK).
 * Idempotent (`grantActiveStudentPortalAccess`). Audit log'ludur.
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    reactivateStudentPortalAccessTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      studentId: params.studentId,
    }),
  { permission: "students:write" }
);
