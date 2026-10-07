/**
 * Herkese açık GRUP DERSİ (kulüp) başvurusu (2026-10-07).
 * POST { clubId, participantName, …, website } → başvuru. Honeypot (`website`) doluysa bot: sessiz başarı, kayıt yok.
 * Kurum yalnız URL'deki addan (slug) çözülür — kimlik istemciden alınmaz (deneme/kariyer formlarıyla aynı desen).
 * Sınırlar: IP başına saatte 12 (süreç içi) + DB'de kalıcı telefon/kurum sınırları (club-applications.ts).
 * Loglara kişisel veri yazılmaz (yalnız kurum kimliği ve hata metni).
 */
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { json, limited, tooLarge } from "@/lib/recruitment/http";
import { submitPublicClubApplication } from "@/lib/club-applications";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ kurum: string }> }) {
  if (tooLarge(req, 20_000)) return json(413, { ok: false, message: "Form çok büyük. Not alanını kısaltıp tekrar deneyin." });
  if (limited("club-apply", req, 12, 60 * 60 * 1000)) {
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
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { ok: false, message: "Form okunamadı. Sayfayı yenileyip tekrar deneyin." });
  if (String(body.website ?? "").trim()) return json(200, { ok: true });
  try {
    const result = await submitPublicClubApplication(tenant, body);
    return result.ok ? json(200, result) : json(result.status, result);
  } catch (e) {
    logger.error("club apply failed", { tenant: tenant.tenantId, error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false, message: "Başvurunuz kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin; sorun sürerse kurumu arayın." });
  }
}
