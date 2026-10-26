import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { cancelAtPeriodEnd } from "@/lib/saas-billing/subscriptions";
import { getSaasBillingProvider } from "@/lib/saas-billing/provider-adapter";
import { getSaasSubscription } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/subscription/cancel
 * Dönem sonunda iptal: ödenmiş süre sonuna kadar erişim sürer.
 * Sağlayıcı tarafında da iptal edilir (mock/hazır değilse yerel iptal korunur).
 */
export const POST = withApiHandler(
  async ({ ctx }) => {
    const sub = await getSaasSubscription(ctx.tenantId);
    if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
    if (sub.providerSubscriptionRef) {
      const provider = getSaasBillingProvider();
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
      note: "Ödenmiş süre sonuna kadar erişiminiz sürer.",
    });
  },
  { permission: "billing:write" }
);
