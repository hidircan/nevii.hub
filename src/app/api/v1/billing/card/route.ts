import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import {
  getSaasBillingProvider,
  newSaasIdempotencyKey,
} from "@/lib/saas-billing/provider-adapter";
import { getSaasSubscription } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/card
 * Kart güncelleme: hosted checkout formu döner. Kart bilgisi sunucuya
 * ASLA gelmez — yalnızca sağlayıcının güvenli sayfası kullanılır.
 */
export const POST = withApiHandler(
  async ({ ctx, request }) => {
    const sub = await getSaasSubscription(ctx.tenantId);
    if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
    if (!sub.providerSubscriptionRef) {
      return fail("VALIDATION_ERROR", "Kart güncellemesi için aktif sağlayıcı aboneliği gerekli.");
    }
    const provider = getSaasBillingProvider();
    if (!provider.isConfigured()) {
      return fail("FORBIDDEN", "Tahsilat sağlayıcısı yapılandırılmadı.");
    }
    const origin = new URL(request.url).origin;
    const init = await provider.initializeCardUpdate({
      subscriptionRef: sub.providerSubscriptionRef,
      callbackUrl: `${origin}/api/v1/billing/checkout/callback`,
      conversationId: `${sub.id}:${newSaasIdempotencyKey()}`,
    });
    if (!init.ok) return fail("INTERNAL_ERROR", init.error, { providerCode: init.errorCode });
    return ok({
      checkoutFormContent: init.checkoutFormContent,
      providerReference: init.providerReference,
      tokenExpireSeconds: init.tokenExpireSeconds,
      mock: init.mock,
    });
  },
  { permission: "billing:write" }
);
