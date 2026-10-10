import { withApiHandler } from "@/lib/api/handler";
import { getSocialMediaConsentTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/students/:studentId/social-media-consent — güncel onay kaydı
 * (yoksa `consent: null`). Sahiplik tool katmanında `assertStudentAccess`.
 */
export const GET = withApiHandler(
  async ({ ctx, params }) => getSocialMediaConsentTool(ctx, { studentId: params.studentId }),
  { permission: "students:read" }
);
