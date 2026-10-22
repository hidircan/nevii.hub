import { withApiHandler } from "@/lib/api/handler";
import { listPendingPeriodicAssessmentsTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/** GET /api/v1/periodic-assessments/pending?teacherId=&studentId= — Faz 3B, bekleyen dört haftalık değerlendirmeler + 4 ders özeti. */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) =>
    listPendingPeriodicAssessmentsTool(ctx, {
      teacherId: searchParams.get("teacherId") || undefined,
      studentId: searchParams.get("studentId") || undefined,
    }),
  { permission: "assessments:read" }
);
