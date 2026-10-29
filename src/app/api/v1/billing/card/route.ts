import { withApiHandler } from "@/lib/api/handler";
import { consumeRateLimit } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/services/result";
import {
  getSaasProvider,
  newSaasIdempotencyKey,
} from "@/lib/saas-billing/provider-adapter";
import { hasCapability } from "@/lib/saas-billing/providers";
import { getSaasSubscription } from "@/lib/saas-billing/store";
import { clientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/card
 * Kart güncelleme — aboneliğin sağlayıcısına göre capability bazlı:
 * iyzico hosted form döner; PayTR dönem borcu tahsilatıyla birlikte yapılır
 * (ayrı sıfır-tutarlı provizyon desteklenmez, açık hata döner).
 * Kart bilgisi sunucuya ASLA gelmez.
 */
export const POST = withApiHandler(
  async ({ ctx, request }) => {
    // §12: kart güncelleme — kullanıcı başına saatte 10.
    if (!consumeRateLimit("billing-card-user", `u:${ctx.userId}`, { windowMs: 3600_000, max: 10 })) {
      return fail("RATE_LIMITED", "Çok fazla istek. Lütfen daha sonra tekrar deneyin.");
    }
    const sub = await getSaasSubscription(ctx.tenantId);
    if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
    const provider = getSaasProvider(sub.provider);
    if (!provider.isConfigured()) {
      return fail("FORBIDDEN", "Tahsilat sağlayıcısı yapılandırılmadı.");
    }
    if (!hasCapability(provider, "card_update_form")) {
      return fail(
        "VALIDATION_ERROR",
        `${sub.provider} için ayrı kart güncelleme akışı yok; kart dönem borcu ödemesiyle birlikte güncellenir.`
      );
    }
    if (!sub.providerSubscriptionRef) {
      return fail("VALIDATION_ERROR", "Kart güncellemesi için aktif sağlayıcı aboneliği gerekli.");
    }
    const origin = new URL(request.url).origin;
    const init = await provider.initializeCardUpdate({
      subscriptionRef: sub.providerSubscriptionRef,
      callbackUrl: `${origin}/api/v1/billing/checkout/callback`,
      conversationId: `${sub.id}:${newSaasIdempotencyKey()}`,
      okUrl: `${origin}/abonelik/sonuc?status=pending`,
      failUrl: `${origin}/abonelik/sonuc?status=error`,
      userIp: clientIp(request),
      customerRef: sub.providerCustomerRef,
    });
    if (!init.ok) return fail("INTERNAL_ERROR", init.error, { providerCode: init.errorCode });
    if (init.kind !== "embed_html") {
      return fail("INTERNAL_ERROR", "Beklenmeyen kart formu türü.");
    }
    return ok({
      kind: init.kind,
      checkoutFormContent: init.checkoutFormContent,
      providerReference: init.providerReference,
      tokenExpireSeconds: init.tokenExpireSeconds,
      mock: init.mock,
    });
  },
  { permission: "billing:write" }
);
