import { consumeQuoteRateLimit, submitQuoteRequest } from "@/lib/saas-billing/quotes";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/quote/request
 * Herkese açık teklif isteği. Abonelik AÇMAZ, davet ÜRETMEZ, kart İSTEMEZ;
 * platform ekibi inceler (NeviiOS "Teklif istekleri"). IP rate-limit +
 * e-posta tekilliği.
 */
export async function POST(request: Request) {
  if (!consumeQuoteRateLimit(clientIp(request))) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin." } },
      { status: 429 }
    );
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz JSON." } },
      { status: 400 }
    );
  }
  const res = await submitQuoteRequest({ input: body });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: 400 }
    );
  }
  return Response.json({ ok: true, data: { requestId: res.data.id } });
}
