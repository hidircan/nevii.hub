import { getNeviiAdsSalesSummary } from "@/lib/saas-billing/neviiads-import";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/billing/neviiads/summary
 * NeviiAds'e salt-okunur satış özeti (yeni başvurular, ödeme bekleyen
 * siparişler, aktif abonelikler). Kullanıcı başlatımlı tek istek; ayrı
 * salt-okunur jeton (`X-NeviiAds-Summary-Token`).
 */
export async function GET(request: Request) {
  if (!consumeRateLimit("neviiads-summary", clientIp(request), { windowMs: 60_000, max: 10 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok sık özet istendi. Bir dakika sonra tekrar deneyin." } },
      { status: 429 }
    );
  }
  const res = await getNeviiAdsSalesSummary({ token: request.headers.get("x-neviiads-summary-token") });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: res.error.code === "FORBIDDEN" ? 403 : 400 }
    );
  }
  return Response.json({ ok: true, data: res.data }, { headers: { "Cache-Control": "no-store" } });
}
