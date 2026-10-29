import { withApiHandler } from "@/lib/api/handler";
import { consumeRateLimit } from "@/lib/rate-limit";
import { fail, ok } from "@/lib/services/result";
import { cancelAtPeriodEnd } from "@/lib/saas-billing/subscriptions";
import { getSaasProvider } from "@/lib/saas-billing/provider-adapter";
import { hasCapability } from "@/lib/saas-billing/providers";
import { getSaasSubscription } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/subscription/cancel
 * Dönem sonunda iptal: ödenmiş süre sonuna kadar erişim sürer.
 * - remote_cancel capability'si varsa (iyzico) sağlayıcıda da iptal edilir;
 *   uzak iptal başarısızsa yerel iptal YAPILMAZ (çift durum yok).
 * - Capability yoksa (PayTR: uzak abonelik nesnesi yok) iptal yereldir ve
 *   zamanlama durur; taklit amaçlı uzak çağrı yapılmaz.
 */
export const POST = withApiHandler(
  async ({ ctx }) => {
    // §12: iptal — kullanıcı başına saatte 10.
    if (!consumeRateLimit("billing-cancel-user", `u:${ctx.userId}`, { windowMs: 3600_000, max: 10 })) {
      return fail("RATE_LIMITED", "Çok fazla istek. Lütfen daha sonra tekrar deneyin.");
    }
    const sub = await getSaasSubscription(ctx.tenantId);
    if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
    const provider = getSaasProvider(sub.provider);
    if (sub.providerSubscriptionRef && hasCapability(provider, "remote_cancel")) {
      const res = await provider.cancelSubscription(sub.providerSubscriptionRef);
      if (!res.ok) {
        return fail(
          "INTERNAL_ERROR",
          `Sağlayıcı iptali başarısız: ${res.error} Yerel iptal yapılmadı; tekrar deneyin.`
        );
      }
    }
    const canceled = await cancelAtPeriodEnd(ctx.tenantId);
    if (!canceled.ok) return canceled;
    return ok({
      status: canceled.data.status,
      canceledAt: canceled.data.canceledAt,
      paidThrough: canceled.data.paidThrough,
      remoteCanceled: Boolean(sub.providerSubscriptionRef && hasCapability(provider, "remote_cancel")),
      note: "Ödenmiş süre sonuna kadar erişiminiz sürer.",
    });
  },
  { permission: "billing:write" }
);
