import { clientIp, json, tooLarge } from "@/lib/recruitment/http";
import { submitTeacherFeedbackViaInviteTool } from "@/lib/services";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
};

/**
 * POST /api/degerlendir/<kod> — kişiye özel bağlantıdan öğretmen değerlendirmesi (oturumsuz; `/api/basvuru/*` deseni).
 * Kimlik ve kurum yalnız bağlantı kodundan; hız sınırı ve tüm kurallar `submitTeacherFeedbackViaInviteTool` içinde.
 */
export async function POST(req: Request, { params }: { params: Promise<{ kod: string }> }) {
  if (tooLarge(req, 20_000)) return json(413, { ok: false, message: "Form çok büyük. Yorumu kısaltıp tekrar deneyin." });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, message: "Form okunamadı. Sayfayı yenileyip tekrar deneyin." });
  }
  try {
    const { kod } = await params;
    const result = await submitTeacherFeedbackViaInviteTool(kod, body, clientIp(req));
    if (result.ok) return json(200, { ok: true, remaining: result.data.remaining });
    const message =
      result.error.code === "VALIDATION_ERROR"
        ? "Lütfen beş ölçütün her biri için 1–5 arasında bir puan seçin."
        : result.error.message;
    return json(STATUS[result.error.code] ?? 500, { ok: false, code: result.error.code, message });
  } catch (e) {
    logger.error("feedback invite submit failed", e instanceof Error ? e.message : String(e));
    return json(500, { ok: false, message: "Değerlendirmeniz kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin." });
  }
}
