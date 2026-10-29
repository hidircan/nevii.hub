import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { submitPurchaseRequest } from "@/lib/saas-billing/purchase";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/purchase-request
 * Herkese açık satın alma başvurusu (checkout hesap adımı). Tenant AÇMAZ,
 * ödeme BAŞLATMAZ; onay sonrası güvenli davet + giriş ile checkout'a devam
 * edilir. IP rate-limit + e-posta tekilliği.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("purchase-request", clientIp(request), { windowMs: 3600_000, max: 5 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla başvuru. Lütfen daha sonra tekrar deneyin." } },
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
  const res = await submitPurchaseRequest({ input: body });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: res.error.code === "NOT_FOUND" ? 404 : 400 }
    );
  }
  return Response.json({ ok: true, data: { requestId: res.data.id } });
}
