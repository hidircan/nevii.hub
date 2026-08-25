import { withApiHandler } from "@/lib/api/handler";
import { listPendingPeriodicAssessmentsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/periodic-assessments/pending?teacherId= — Faz 3B, bekleyen dört haftalık değerlendirmeler. */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listPendingPeriodicAssessmentsTool(ctx, { teacherId: searchParams.get("teacherId") || undefined }),
  { permission: "assessments:read" }
);
