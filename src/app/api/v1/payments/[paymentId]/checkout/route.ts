import { withApiHandler } from "@/lib/api/handler";
import { initiateStudentPaymentCheckoutTool } from "@/lib/services";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/payments/:paymentId/checkout
 * body: {} (hiçbir alan client'tan güvenilmez)
 *
 * Sağlayıcı-barındırmalı (hosted) online kredi kartı checkout'u başlatır.
 * Kart/CVV verisi asla bu route'a veya veritabanına ULAŞMAZ — yalnızca
 * sağlayıcının checkout URL'ine yönlendirilir. Tenant izolasyonu +
 * ödeme sahipliği + AKTİF StudentPortalAccess kontrolü tool katmanında
 * (`initiateStudentPaymentCheckoutTool` → `assertStudentAccess`) yapılır.
 * Gerçek bir sağlayıcı bağlanmadıkça FAIL-CLOSED (bkz. src/lib/payment-provider).
 *
 * `successUrl`/`cancelUrl`/`buyerIp` BİLİNÇLİ OLARAK client body'sinden
 * OKUNMAZ — sunucu tarafında `request`'ten hesaplanır. Bu, hem açık
 * yönlendirme (open-redirect) riskini kapatır hem de "return URL yalnızca
 * kullanıcı deneyimi içindir, doğrulama kaynağı değildir" kuralını
 * garanti eder (ödeme "paid" durumuna SADECE webhook ile geçer, bkz.
 * /api/v1/payments/webhook).
 */
export const POST = withApiHandler(
  async ({ ctx, params, request }) => {
    const origin = new URL(request.url).origin;
    return initiateStudentPaymentCheckoutTool(ctx, {
      paymentId: params.paymentId,
      successUrl: `${origin}/ogrenci?checkout=success`,
      cancelUrl: `${origin}/ogrenci?checkout=cancelled`,
      buyerIp: clientIp(request),
    });
  },
  { permission: "payments:checkout" }
);
