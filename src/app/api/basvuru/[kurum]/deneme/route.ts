/**
 * Herkese açık deneme dersi başvurusu (2026-10-05).
 * GET  ?instrument=&branchId= → uygun zaman seçenekleri (yalnız tarih/saat/şube; öğretmen bilgisi dönmez).
 * POST { …form, website } → başvuru. Honeypot (`website`) doluysa bot: sessiz başarı, kayıt yok.
 * Kurum yalnız URL'deki addan (slug) çözülür — kimlik istemciden alınmaz (kariyer formuyla aynı desen).
 */
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { json, limited } from "@/lib/recruitment/http";
import { loadTrialSlotSuggestions, submitPublicTrialApplication } from "@/lib/trial-applications";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ kurum: string }> }) {
  if (limited("trial-slots", req, 60, 10 * 60 * 1000)) {
    return json(429, { ok: false, message: "Çok sık deneme yapıldı. Birkaç dakika sonra tekrar deneyin." });
  }
  const tenant = await resolveCareerTenant((await params).kurum);
  if (!tenant) return json(404, { ok: false, message: "Başvuru sayfası bulunamadı. Bağlantıyı kurumdan yeniden isteyin." });
  const url = new URL(req.url);
  const instrument = (url.searchParams.get("instrument") ?? "").slice(0, 80);
  const branchId = (url.searchParams.get("branchId") ?? "").slice(0, 80) || undefined;
  if (!instrument) return json(400, { ok: false, message: "Önce enstrüman seçin." });
  try {
    const slots = await runWithTenantAsync(tenant.tenantId, () => loadTrialSlotSuggestions(tenant.tenantId, { instrument, branchId }));
    return json(200, { ok: true, slots: slots.map(({ startAt, branchId: b }) => ({ startAt, branchId: b })) });
  } catch (e) {
    logger.error("trial slots failed", { tenant: tenant.tenantId, error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false, message: "Uygun zamanlar şu an getirilemedi. Uygun olduğunuz zamanları not alanına yazarak başvurabilirsiniz." });
  }
}

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
