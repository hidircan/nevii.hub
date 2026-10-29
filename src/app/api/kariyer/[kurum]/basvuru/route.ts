/**
 * Herkese açık: başvuru gönderimi (multipart: `data` JSON + opsiyonel `cv` dosyası).
 * Honeypot alanı (`website`) doluysa bot kabul edilir ve sessizce başarı döner (kayıt açılmaz).
 */
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { submitPublicApplication } from "@/lib/recruitment/public";
import { json, limited, readCvFromForm, tooLarge } from "@/lib/recruitment/http";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ kurum: string }> }) {
  if (limited("career-apply", req, 8, 60 * 60 * 1000)) {
    return json(429, { ok: false, message: "Kısa sürede çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin." });
  }
  const { kurum } = await params;
  const tenant = await resolveCareerTenant(kurum);
  if (!tenant) return json(404, { ok: false, message: "Kariyer sayfası bulunamadı." });
  if (tooLarge(req)) return json(413, { ok: false, message: "Dosya çok büyük. CV en fazla 4 MB olabilir." });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, message: "Form okunamadı. Dosya 4 MB'tan büyük olabilir." });
  }
  if (String(form.get("website") ?? "").trim()) return json(200, { ok: true, applicationNumber: "IK-000000", duplicate: false });
  let data: unknown;
  try {
    data = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return json(400, { ok: false, message: "Form verisi okunamadı." });
  }
  try {
    const cv = await readCvFromForm(form);
    const result = await submitPublicApplication(tenant, data, cv);
    if (!result.ok) return json(result.status, result);
    return json(200, result);
  } catch (e) {
    logger.error("career apply failed", { tenant: tenant.tenantId, error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false, message: "Başvurunuz kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin." });
  }
}
