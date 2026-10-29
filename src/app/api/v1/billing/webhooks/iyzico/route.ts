import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { logger } from "@/lib/logger";
import {
  findSubscriptionByProviderRef,
  processIyzicoSubscriptionWebhook,
} from "@/lib/saas-billing/webhooks";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/**
 * POST /api/v1/billing/webhooks/iyzico
 * Public — sağlayıcı imzasıyla doğrulanır (server-to-server), JWT yok.
 *
 * - İmza: X-IYZ-SIGNATURE-V3, abonelik formülü (resmi doküman, Ekim 2026).
 * - Hesapta imza özelliği etkin değilse endpoint güvenilir sayılmaz (fail-closed).
 * - Event inbox + benzersiz olay kimliği → yinelenen teslimat tek etki.
 * - Gecikmiş olay eski duruma geri döndürmez.
 */
export async function POST(request: Request) {
  if (
    !consumeRateLimit("saas-billing-webhook", clientIp(request), {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
    })
  ) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
      { status: 429 }
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-iyz-signature-v3");

  const res = await processIyzicoSubscriptionWebhook({
    rawBody,
    signatureHeader,
    resolveTenant: (ref) => findSubscriptionByProviderRef(ref),
  });
  if (!res.ok) {
    logger.warn("saas.webhook.rejected", res.error.message);
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Webhook doğrulanamadı." } },
      { status: 401 }
    );
  }
  return Response.json({ ok: true, outcome: res.data.outcome });
}
