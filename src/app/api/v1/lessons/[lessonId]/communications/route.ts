import { withApiHandler } from "@/lib/api/handler";
import { fromServiceResult, jsonFail } from "@/lib/api/http";
import { listLessonCommunicationMessagesTool } from "@/lib/communications/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/lessons/:lessonId/communications — 11. tur iş #2.
 *
 * Ders detayındaki "Bilgilendirme geçmişi": tenant kapsamlı, maskeli satırlar.
 * Personel + dersin öğretmeni (kendi dersleri) görebilir.
 */
export const GET = withApiHandler(async ({ ctx, params }) => {
  const lessonId = params.lessonId;
  if (!lessonId) return jsonFail("VALIDATION_ERROR", "Ders kimliği gerekli.");
  const result = await listLessonCommunicationMessagesTool(ctx, { lessonId });
  return fromServiceResult(result);
});
