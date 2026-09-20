import { withApiHandler } from "@/lib/api/handler";
import { cancelLessonTool } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/lessons/:lessonId/cancel — dersi iptal eder (admin P0).
 * Idempotent: zaten iptal edilmiş derste no-op `ok` döner. İptal bildirimi
 * tool içinden best-effort gönderilir; işlem audit log'ludur.
 * Yalnız SCHOOL_ADMIN/SUPER_ADMIN (AI_AGENT tool-içi; route kapısı admin).
 */
export const POST = withApiHandler(
  async ({ ctx, params }) => cancelLessonTool(ctx, { lessonId: params.lessonId }),
  { permission: "students:write" }
);
