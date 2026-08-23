import { getPaymentProvider } from "@/lib/payment-provider/provider-factory";
import {
  findCheckoutAttemptByProviderReference,
  markCheckoutAttemptFailed,
  markCheckoutAttemptSucceeded,
} from "@/lib/payment-checkout";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/client-ip";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/**
 * POST /api/v1/payments/webhook
 * Public endpoint — authenticated via provider signature, NOT JWT (server-to-server).
 * Kart/CVV verisi asla buraya ulaşmaz (sağlayıcı yalnızca ödeme SONUCUNU bildirir).
 *
 * Fail-closed: `verifyWebhook` başarısızsa (imza geçersiz VEYA sağlayıcı hiç
 * yapılandırılmadıysa — bkz. consoleProvider) hiçbir `Payment`/
 * `PaymentCheckoutAttempt` durumu değişmez. Ödeme "paid" durumuna SADECE
 * buradan geçer — redirect query param'ı/client callback'i asla bu kararı
 * tetikleyemez (bkz. checkout route: successUrl yalnız UX içindir).
 *
 * Sıralama BİLİNÇLİDİR: önce `collectPayment` (SET semantiği — idempotent,
 * iki kez çağrılması aynı sonucu üretir), SONRA `markCheckoutAttemptSucceeded`
 * (CAS — yalnızca henüz succeeded değilse true döner). Bu sıra, süreç
 * `collectPayment` ile işaretleme arasında çökerse bile bir sonraki
 * webhook/retry'ın ödemeyi YİNE tahsil edebilmesini garanti eder — tersi
 * sırada "attempt succeeded ama Payment hiç tahsil edilmedi" biçiminde
 * kalıcı bir tutarsızlık riski olurdu.
 */
export async function POST(request: Request) {
  if (
    !consumeRateLimit("payments-webhook", clientIp(request), {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
    })
  ) {
    return Response.json({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 });
  }

  const rawBody = await request.text();
  // X-IYZ-SIGNATURE-V3 — iyzico'nun güncel resmi webhook imza header'ı
  // (docs.iyzico.com/en/advanced/webhook, Ağustos 2026); eski V1/V2 artık
  // desteklenmiyor. `stripe-signature` yalnızca gelecekte Stripe eklenirse
  // diye korunuyor (henüz Stripe adapter'ı yok).
  const signatureHeader = request.headers.get("x-iyz-signature-v3") ?? request.headers.get("stripe-signature");

  const provider = getPaymentProvider();
  const verification = await provider.verifyWebhook({ rawBody, signatureHeader });
  if (!verification.ok) {
    logger.warn("payments.webhook.rejected", verification.error);
    return Response.json({ ok: false, error: { code: "UNAUTHORIZED", message: verification.error } }, { status: 401 });
  }

  const attempt = await findCheckoutAttemptByProviderReference(verification.providerReference);
  if (!attempt) {
    logger.warn("payments.webhook.unknown_reference", verification.providerReference);
    return Response.json({ ok: false, error: { code: "NOT_FOUND", message: "Bilinmeyen providerReference" } }, { status: 404 });
  }

  if (verification.status === "failed") {
    if (attempt.status !== "succeeded") await markCheckoutAttemptFailed(attempt.tenantId, attempt.id);
    return Response.json({ ok: true });
  }

  // İdempotency/replay koruması — zaten succeeded ise Payment'a İKİNCİ kez
  // dokunmadan erken döneriz (collectPayment idempotent olsa da gereksiz
  // bir yazma/senkron turu atlanır).
  if (attempt.status === "succeeded") {
    return Response.json({ ok: true });
  }

  try {
    const { collectPayment } = await import("@/lib/payments/collect");
    await collectPayment(attempt.paymentId, {
      amount: attempt.amount,
      method: "credit_card",
      receivedByUserId: attempt.initiatedByUserId,
      actorUserId: attempt.initiatedByUserId,
      tenantId: attempt.tenantId,
    });
  } catch (e) {
    logger.warn("payments.webhook.collect_failed", attempt.paymentId, e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Tahsilat işlenemedi" } }, { status: 500 });
  }

  await markCheckoutAttemptSucceeded(attempt.tenantId, attempt.id);

  return Response.json({ ok: true });
}
