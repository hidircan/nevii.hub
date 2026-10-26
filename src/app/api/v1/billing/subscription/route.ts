import { withApiHandler } from "@/lib/api/handler";
import { fail, ok } from "@/lib/services/result";
import { decideSaasAccess } from "@/lib/saas-billing/enforcement";
import { formatMinorTR } from "@/lib/saas-billing/types";
import { getSaasSubscription, listSaasAttempts } from "@/lib/saas-billing/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/billing/subscription
 * Kurum sahibi görünümü: paket, yenileme tarihi/tutarı, ödeme yöntemi özeti,
 * ödeme geçmişi, iptal/yeniden etkinleştirme durumu.
 * Finansal detay yalnız billing:read izni olan rollere (sahip + yönetici).
 */
export const GET = withApiHandler(
  async ({ ctx }) => {
    const sub = await getSaasSubscription(ctx.tenantId);
    if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
    const attempts = await listSaasAttempts(sub.id, 50);
    const access = await decideSaasAccess(ctx.tenantId);
    const s = sub.priceSnapshot;
    return ok({
      planKey: sub.planKey,
      planLabel: s.planLabel,
      status: sub.status,
      billingInterval: sub.billingInterval,
      currency: sub.currency,
      amountMinor: s.amountMinor,
      displayTotal: formatMinorTR(s.amountMinor),
      monthlyEquivalentMinor: s.monthlyEquivalentMinor,
      displayMonthlyEquivalent:
        s.monthlyEquivalentMinor === null ? null : formatMinorTR(s.monthlyEquivalentMinor),
      renewalNote: s.renewalNote,
      taxNote: s.taxNote,
      sandbox: s.sandbox,
      campaignCode: s.campaignCode,
      campaignNote: s.campaignNote,
      postCampaignNote: s.postCampaignNote,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodEnd: sub.currentPeriodEnd,
      paidThrough: sub.paidThrough,
      canceledAt: sub.canceledAt,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      paymentMethod: sub.providerSubscriptionRef
        ? { provider: sub.provider, onFile: true }
        : { provider: sub.provider, onFile: false },
      access: {
        allowed: access.allowed,
        scope: access.scope,
        billingActionRequired: access.billingActionRequired,
        exceptionActive: access.exceptionActive,
      },
      history: attempts.map((a) => ({
        id: a.id,
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        amountMinor: a.amountMinor,
        displayAmount: formatMinorTR(a.amountMinor),
        status: a.status,
        kind: a.kind,
        attemptNo: a.attemptNo,
        providerRef: a.providerRef,
        error: a.error,
        createdAt: a.createdAt,
      })),
    });
  },
  { permission: "billing:read" }
);
