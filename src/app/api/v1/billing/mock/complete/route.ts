import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { applyNormalizedPaymentEvent } from "@/lib/saas-billing/webhooks";
import { getSaasSubscription } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/billing/mock/complete
 * LOCAL DEMO webhook simülatörü: bekleyen mock aboneliği "başarılı ödeme
 * bildirimi" ile active duruma geçirir (aktif-sonrası görünüm için).
 *
 * KİLİTLER (hepsi zorunlu):
 * - production'da YOK (404).
 * - Yalnız SAAS_BILLING_PROVIDER=mock iken.
 * - Yalnız SAAS_MOCK_WEBHOOK_ENABLED=true iken (açık local onay).
 * - Yalnız çağrıcının KENDİ tenant aboneliği (istemci tenant iddiası yok).
 * - Olay `mock:test` hesabından, payload `{mock:true}` etiketlidir;
 *   gerçek PayTR/iyzico akışını taklit etmez, gerçek tahsilat yapmaz.
 */
function guard(): { ok: true } | { ok: false; status: number; message: string } {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return { ok: false, status: 404, message: "Bulunamadı." };
  }
  if (process.env.SAAS_BILLING_PROVIDER !== "mock") {
    return { ok: false, status: 403, message: "Mock tamamlama yalnız mock sağlayıcıda çalışır." };
  }
  if (process.env.SAAS_MOCK_WEBHOOK_ENABLED !== "true") {
    return { ok: false, status: 403, message: "Mock webhook simülatörü kapalı (SAAS_MOCK_WEBHOOK_ENABLED=true gerekli)." };
  }
  return { ok: true };
}

export const POST = withApiHandler(
  async ({ ctx }) => {
    const g = guard();
    if (!g.ok) return fail(g.status === 404 ? "NOT_FOUND" : "FORBIDDEN", g.message);
    const sub = await getSaasSubscription(ctx.tenantId);
    if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
    if (sub.status !== "pending") {
      return fail("VALIDATION_ERROR", `Yalnız bekleyen (pending) abonelik tamamlanabilir (şu an: ${sub.status}).`);
    }
    const now = new Date().toISOString();
    const res = await applyNormalizedPaymentEvent({
      event: {
        provider: "mock",
        merchantAccount: "mock:test",
        eventId: `mock_complete_${sub.id}_${Date.now()}`,
        eventType: "mock.payment_succeeded",
        succeeded: true,
        amountMinor: sub.priceSnapshot.totalWithTaxMinor ?? sub.priceSnapshot.amountMinor,
        currency: sub.currency,
        providerRef: sub.providerSubscriptionRef ?? sub.id,
        eventTimeIso: now,
        payload: { mock: true, note: "local demo webhook simulator; gercek tahsilat degildir" },
        refs: {
          customerRef: `mock_cus_${sub.id}`,
          subscriptionRef: `mock_sub_${sub.id}`,
          cardRef: null,
          planRef: "mock_plan",
        },
      },
      resolveTenant: async (ref) => {
        // refs.subscriptionRef bu simülatörün ürettiği mock referanstır.
        if (ref === sub.id || ref === sub.providerSubscriptionRef || ref === `mock_sub_${sub.id}`) {
          return sub.tenantId;
        }
        return null;
      },
      nowIso: now,
    });
    if (!res.ok) return res;
    return ok({ status: "active", outcome: res.data.outcome, mock: true });
  },
  { permission: "billing:write" }
);
