/**
 * Herkese açık: CV'yi okuyup başvuru formunu ön doldurmak için alanları döndürür.
 * Dosya burada SAKLANMAZ (yalnız ayrıştırılır); başvuru gönderilirken aynı dosya yeniden yüklenir.
 */
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { detectCvKind, parseCv } from "@/lib/recruitment/cv-parser";
import { CV_MAX_BYTES } from "@/lib/recruitment/constants";
import { json, limited, readCvFromForm, tooLarge, withTimeout } from "@/lib/recruitment/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/recruitment/store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ kurum: string }> }) {
  if (limited("career-cv-parse", req, 20, 10 * 60 * 1000)) {
    return json(429, { ok: false, message: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin veya formu elle doldurun." });
  }
  const { kurum } = await params;
  const tenant = await resolveCareerTenant(kurum);
  if (!tenant || !(await getSettings(tenant.tenantId)).careerPageEnabled) return json(404, { ok: false, message: "Kariyer sayfası bulunamadı." });
  if (tooLarge(req)) return json(413, { ok: false, message: "CV dosyası en fazla 4 MB olabilir." });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, message: "Dosya okunamadı. Lütfen tekrar deneyin." });
  }
  const cv = await readCvFromForm(form);
  if (!cv) return json(400, { ok: false, message: "Bir CV dosyası seçin." });
  if (cv.data.length > CV_MAX_BYTES) return json(413, { ok: false, message: "CV dosyası en fazla 4 MB olabilir." });
  const kind = detectCvKind(cv.data, cv.mimeType, cv.fileName);
  if (!kind) return json(415, { ok: false, message: "CV yalnız PDF veya Word (.docx) olabilir." });
  try {
    const { resolveActiveInstrumentNames } = await import("@/lib/instrument-catalog");
    const knownInstruments = await resolveActiveInstrumentNames(tenant.tenantId).catch(() => [] as string[]);
    // AI okuma YALNIZ adayın açık tercihiyle (CV metni yurt dışındaki AI sağlayıcısına gider) ve sınırlı sayıda.
    const wantsAi = form.get("ai") === "1" && process.env.RECRUITMENT_CV_AI !== "off";
    const allowAi =
      wantsAi &&
      !limited("career-cv-ai", req, 5, 10 * 60 * 1000) &&
      consumeRateLimit("career-cv-ai-tenant", tenant.tenantId, { windowMs: 864e5, max: 200 });
    const result = await withTimeout(parseCv(cv.data, kind, { knownInstruments, allowAi }), 25_000, "CV_PARSE_TIMEOUT");
    return json(200, { ok: true, ...result });
  } catch (e) {
    logger.warn("career cv parse failed", { tenant: tenant.tenantId, error: e instanceof Error ? e.message : String(e) });
    return json(200, { ok: true, method: "rules", fields: {}, filled: [], textLength: 0, warning: "CV okunamadı (taranmış görüntü olabilir). Lütfen alanları elle doldurun." });
  }
}
