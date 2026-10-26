import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { submitTrialRequest } from "@/lib/saas-billing/trial";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/trial/request
 * Herkese açık deneme başvurusu. Tenant AÇMAZ, kart İSTEMEZ; onay sonrası
 * mevcut güvenli davet akışıyla ilerlenir. IP rate-limit + e-posta tekilliği.
 */
export async function POST(request: Request) {
  if (!consumeRateLimit("trial-request", clientIp(request), { windowMs: 3600_000, max: 5 })) {
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
  const res = await submitTrialRequest({ input: body });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: { code: res.error.code, message: res.error.message } },
      { status: 400 }
    );
  }
  return Response.json({ ok: true, data: { requestId: res.data.id } });
}
