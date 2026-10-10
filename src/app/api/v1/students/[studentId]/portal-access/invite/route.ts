import { withApiHandler } from "@/lib/api/handler";
import { inviteStudentPortalAccessTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/students/:studentId/portal-access/invite { email, accessType } —
 * portal daveti oluşturur (e-posta başına saatlik rate-limit tool içindedir).
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN.
 */
export const POST = withApiHandler(
  async ({ ctx, params, body }) =>
    inviteStudentPortalAccessTool(ctx, {
      ...(typeof body === "object" && body !== null ? body : {}),
      studentId: params.studentId,
    }),
  { permission: "students:write" }
);
