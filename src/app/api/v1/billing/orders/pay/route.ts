import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { startOrderPayment } from "@/lib/saas-billing/pending-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/orders/pay — Adım 3 "Ödemeyi tamamla" (token'lı).
 * Fiyat güncel yayından yeniden çözülür, snapshot dondurulur, fatura
 * profili yazılır, sağlayıcı akışı başlatılır.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("pending-order-pay", clientIp(request), { windowMs: 3600_000, max: 20 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin." } },
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
  const res = await startOrderPayment({
    token: String(body.t ?? ""),
    acceptedTerms: body.acceptedTerms === true,
    acceptedRecurring: body.acceptedRecurring === true,
    marketingConsent: body.marketingConsent === true,
    docVersions: body.docVersions,
    userIp: clientIp(request),
    origin: new URL(request.url).origin,
  });
  if (!res.ok) {
    const notReady =
      res.error.code === "FORBIDDEN" &&
      (res.error.details as { providerNotReady?: boolean } | undefined)?.providerNotReady === true;
    const status = res.error.code === "NOT_FOUND" ? 404 : notReady ? 503 : 400;
    return Response.json(
      {
        ok: false,
        error: {
          code: notReady ? "PROVIDER_NOT_READY" : res.error.code,
          message: res.error.message,
        },
      },
      { status }
    );
  }
  return Response.json({ ok: true, data: res.data });
}
