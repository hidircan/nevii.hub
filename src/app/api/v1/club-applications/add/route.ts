import { withApiHandler } from "@/lib/api/handler";
import { commitAddToClubTool, previewAddToClubTool } from "@/lib/club-applications";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/club-applications/add { mode: "preview" | "commit", applicationId, studentId, startDate?, confirmSolfegeWaitlist? }
 * Önizleme yazmaz. Onay tek kilit/transaction içinde kapasite + mükerrer + yetkiyi yeniden denetler; idempotenttir.
 */
export const POST = withApiHandler(async ({ ctx, body }) =>
  (body as { mode?: string } | null)?.mode === "commit" ? commitAddToClubTool(ctx, body) : previewAddToClubTool(ctx, body)
);
