import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { completeMockOrder } from "@/lib/saas-billing/pending-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/mock/complete-order — token'lı mock tamamlama.
 * mock/complete ile AYNI kilitler: non-prod + mock sağlayıcı + açık simülatör.
 * Yalnız token sahibinin KENDİ bekleyen siparişi; gerçek tahsilat yapmaz.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("mock-complete-order", clientIp(request), { windowMs: 3600_000, max: 30 })) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla istek." } },
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
  const res = await completeMockOrder({
    token: String(body.t ?? ""),
    origin: new URL(request.url).origin,
  });
  if (!res.ok) {
    const status = res.error.code === "NOT_FOUND" ? 404 : 400;
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status }
    );
  }
  return Response.json({ ok: true, data: res.data });
}
