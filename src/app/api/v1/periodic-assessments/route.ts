import { withApiHandler } from "@/lib/api/handler";
import { createPeriodicAssessmentTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** POST /api/v1/periodic-assessments — Faz 3B, dört haftalık değerlendirme gönderimi. */
export const POST = withApiHandler(
  async ({ ctx, body }) => createPeriodicAssessmentTool(ctx, body),
  { permission: "assessments:write" }
);
