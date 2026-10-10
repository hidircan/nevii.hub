/**
 * Herkese açık deneme dersi başvurusu (2026-10-05).
 * POST { …form, website } → başvuru. Honeypot (`website`) doluysa bot: sessiz başarı, kayıt yok.
 * 2026-10-06: öğretmen müsaitliğinden saat önerisi veren GET kaldırıldı — aday 1–5 alternatifi kendisi yazar.
 * Kurum yalnız URL'deki addan (slug) çözülür — kimlik istemciden alınmaz (kariyer formuyla aynı desen).
 */
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { json, limited } from "@/lib/recruitment/http";
import { submitPublicTrialApplication } from "@/lib/trial-applications";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ kurum: string }> }) {
  if (limited("trial-apply", req, 6, 60 * 60 * 1000)) {
    return json(429, { ok: false, message: "Kısa sürede çok fazla başvuru gönderildi. Lütfen daha sonra tekrar deneyin." });
  }
  const tenant = await resolveCareerTenant((await params).kurum);
  if (!tenant) return json(404, { ok: false, message: "Başvuru sayfası bulunamadı. Bağlantıyı kurumdan yeniden isteyin." });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, message: "Form okunamadı. Sayfayı yenileyip tekrar deneyin." });
  }
  if (String(body.website ?? "").trim()) return json(200, { ok: true });
  try {
    const result = await submitPublicTrialApplication(tenant, body);
    return result.ok ? json(200, result) : json(result.status, result);
  } catch (e) {
    logger.error("trial apply failed", { tenant: tenant.tenantId, error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false, message: "Başvurunuz kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin." });
  }
}
