import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { logger } from "@/lib/logger";
import { processPaytrCallback } from "@/lib/saas-billing/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/callbacks/paytr — PayTR Bildirim URL.
 *
 * - Form-encoded callback; HMAC imzası doğrulanır (fail-closed).
 * - Duplicate bildirimler tek etki üretir; yanıtta HER ZAMAN düz "OK"
 *   metni döner (PayTR sözleşmesi; hata durumunda bile gövde "OK" olmalı,
 *   HTTP kodu bilgi amaçlıdır).
 * - SADECE PayTR adaptörü kullanılır; global ayar değişimi eski
 *   işlemleri etkilemez.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("paytr-callback", clientIp(request), { windowMs: 60_000, max: 120 })) {
    return new Response("OK", { status: 429, headers: { "Content-Type": "text/plain" } });
  }
  const form: Record<string, string> = {};
  try {
    const data = await request.formData();
    for (const [k, v] of data.entries()) {
      if (typeof v === "string") form[k] = v;
    }
  } catch {
    return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  const res = await processPaytrCallback({ form });
  if (!res.ok) {
    logger.warn("saas.paytr_callback.rejected", res.error.message);
  }
  // PayTR sözleşmesi: gövde her zaman "OK".
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
