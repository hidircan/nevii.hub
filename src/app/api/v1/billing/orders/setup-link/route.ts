import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { reissueSetupLink } from "@/lib/saas-billing/pending-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/orders/setup-link — kurulum bağlantısı yeniden
 * gönderimi (kontrollü: saatte 3). Eski jeton ölür, yenisi üretilir.
 * Local turda bağlantı ekranda gösterilir; gerçek e-posta gönderilmez.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("order-setup-link", clientIp(request), { windowMs: 3600_000, max: 3 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla yeniden gönderim. Lütfen daha sonra tekrar deneyin." } },
      { status: 429 }
    );
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz JSON." } },
      { status: 400 }
    );
  }
  const res = await reissueSetupLink({ token: String(body.t ?? "") });
  if (!res.ok) {
    const status = res.error.code === "NOT_FOUND" ? 404 : 400;
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status }
    );
  }
  return Response.json({ ok: true, data: res.data });
}
