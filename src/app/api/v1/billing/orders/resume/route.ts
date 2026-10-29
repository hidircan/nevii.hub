import { createHash } from "crypto";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { requestOrderResume } from "@/lib/saas-billing/pending-orders";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/orders/resume — sürdürme bağlantısı isteği.
 * Yanıt HER ZAMAN aynıdır (kayıt var/yok sızdırılmaz). Sıkı hız sınırı:
 * IP başına + e-posta başına saatte 5.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Geçersiz JSON." } },
      { status: 400 }
    );
  }
  const emailKey = createHash("sha256").update(String(body.email ?? "").toLowerCase(), "utf8").digest("hex");
  if (
    !consumeRateLimit("order-resume-ip", ip, { windowMs: 3600_000, max: 5 }) ||
    !consumeRateLimit("order-resume-email", emailKey, { windowMs: 3600_000, max: 5 })
  ) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin." } },
      { status: 429 }
    );
  }
  await requestOrderResume({ email: body.email, origin: new URL(request.url).origin });
  return Response.json({
    ok: true,
    data: {
      message:
        "Bu adrese ait ödeme bekleyen bir kayıt varsa sürdürme bağlantısı gönderildi. Gelen kutunuzu kontrol edin.",
    },
  });
}
