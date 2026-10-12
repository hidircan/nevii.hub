import { withApiHandler } from "@/lib/api/handler";
import { initiateStudentPaymentCheckoutTool } from "@/lib/services";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * Mobil uygulama scheme'i — dönüş URL'leri SUNUCUDA sabitlenir, client
 * body'sinden ASLA okunmaz (open-redirect kapalı; web route ile aynı kural).
 */
export const MOBILE_PAYMENT_RESULT_SCHEME = "neviihub://payment-result";

function resultUrl(status: "success" | "cancelled", paymentId: string): string {
  return `${MOBILE_PAYMENT_RESULT_SCHEME}?status=${status}&paymentId=${encodeURIComponent(paymentId)}`;
}

/**
 * POST /api/v1/mobile/payments/:paymentId/checkout — body: {} (hiçbir alan
 * client'tan güvenilmez).
 *
 * Web checkout (`/api/v1/payments/:paymentId/checkout`) ile AYNI tool, AYNI
 * yetki (`payments:checkout` + AKTİF StudentPortalAccess sahipliği), AYNI
 * fail-closed (sağlayıcı yapılandırılmadıysa kayıt YOK). Tek fark dönüş
 * URL'leri: web sayfası yerine uygulama deep-link'i. Kart/CVV verisi bu
 * route'a veya veritabanına ULAŞMAZ — yalnızca sağlayıcının hosted checkout
 * URL'ine yönlendirilir; "paid" durumuna geçiş SADECE doğrulanmış webhook
 * ile olur (bkz. /api/v1/payments/webhook).
 */
export const POST = withApiHandler(
  async ({ ctx, params, request }) => {
    return initiateStudentPaymentCheckoutTool(ctx, {
      paymentId: params.paymentId,
      successUrl: resultUrl("success", params.paymentId),
      cancelUrl: resultUrl("cancelled", params.paymentId),
      buyerIp: clientIp(request),
    });
  },
  { permission: "payments:checkout" }
);
