import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getBillingProfile, getSaasCampaignByCode, getSaasSubscription, listSaasAttempts } from "@/lib/saas-billing/store";
import { getTaxConfig } from "@/lib/saas-billing/tax";
import { describeCampaignSchedule } from "@/lib/saas-billing/campaigns";
import { decideSaasAccess } from "@/lib/saas-billing/enforcement";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";
import { getPricedPlan } from "@/lib/saas-billing/catalog";
import { BillingDashboard } from "@/components/billing/billing-dashboard";
import { CheckoutSteps } from "@/components/billing/checkout-steps";
import { formatMinorTR } from "@/lib/saas-billing/types";

export const dynamic = "force-dynamic";

/**
 * Kurum sahibi fatura/abonelik sayfası — kısıtlıyken de AÇIK (muaf yol).
 * Paket, yenileme tarihi/tutarı, ödeme yöntemi özeti, ödeme geçmişi, iptal,
 * yeniden etkinleştirme, kart güncelleme ve deneme başlatma.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    // Seçim korunur: giriş sonrası aynı paket/periyotla dönülür.
    const qp = new URLSearchParams();
    if (params.plan) qp.set("plan", params.plan);
    if (params.interval) qp.set("interval", params.interval);
    const back = qp.size > 0 ? `/abonelik?${qp.toString()}` : "/abonelik";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") {
    redirect(homePathForRole(session.role));
  }
  const canWrite = session.role === "SUPER_ADMIN";

  const [sub, access, catalog, billingProfile] = await Promise.all([
    getSaasSubscription(session.tenantId),
    decideSaasAccess(session.tenantId),
    getPublishedCatalog(),
    getBillingProfile(session.tenantId),
  ]);
  const attempts = sub ? await listSaasAttempts(sub.id, 50) : [];
  const campaignRecord =
    sub?.priceSnapshot.campaignCode
      ? await getSaasCampaignByCode(sub.priceSnapshot.campaignCode)
      : null;
  const campaignSchedule = campaignRecord
    ? describeCampaignSchedule({
        maxRenewals: campaignRecord.maxRenewals,
        validTo: campaignRecord.validTo,
      })
    : null;
  const campaign =
    sub?.priceSnapshot.campaignCode && campaignSchedule
      ? {
          name: campaignRecord?.name ?? sub.priceSnapshot.campaignCode,
          scheduleHeadline: campaignSchedule.headline,
          scheduleLines: campaignSchedule.lines,
          afterNote:
            sub.priceSnapshot.campaignNote ?? sub.priceSnapshot.postCampaignNote ?? "",
        }
      : null;
  const plans = [];
  for (const p of catalog.catalog.plans) {
    if (p.status !== "active" || p.legacy) continue;
    const monthly = await getPricedPlan(p.key, "monthly");
    const yearly = await getPricedPlan(p.key, "yearly");
    if (monthly && yearly) plans.push({ key: p.key, label: p.label, description: p.description || null, monthly, yearly });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Abonelik ve Ödemeler</h1>
          <p className="mt-1 text-sm text-slate-600">
            Paketiniz, yenileme bilgileriniz ve ödeme geçmişiniz.
          </p>
        </div>
        <a href="/panel" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
          ← Panele dön
        </a>
      </div>
      {params.plan ? (
        <div className="mb-6">
          <CheckoutSteps current={2} />
        </div>
      ) : null}
      <BillingDashboard
        canWrite={canWrite}
        subscription={
          sub
            ? {
                planKey: sub.planKey,
                planLabel: sub.priceSnapshot.planLabel,
                status: sub.status,
                billingInterval: sub.billingInterval,
                displayTotal: formatMinorTR(sub.priceSnapshot.amountMinor),
                displayMonthlyEquivalent:
                  sub.priceSnapshot.monthlyEquivalentMinor === null
                    ? null
                    : formatMinorTR(sub.priceSnapshot.monthlyEquivalentMinor),
                renewalNote: sub.priceSnapshot.renewalNote,
                taxNote: sub.priceSnapshot.taxNote,
                sandbox: sub.priceSnapshot.sandbox,
                trialEndsAt: sub.trialEndsAt,
                paidThrough: sub.paidThrough,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                paymentOnFile: Boolean(sub.providerSubscriptionRef || sub.providerCardRef),
                provider: sub.provider,
                executionModel: sub.executionModel,
                campaign,
              }
            : null
        }
        attempts={attempts.map((a) => ({
          id: a.id,
          periodStart: a.periodStart,
          periodEnd: a.periodEnd,
          displayAmount: formatMinorTR(a.amountMinor),
          kind: a.kind,
          status: a.status,
          createdAt: a.createdAt,
        }))}
        access={{ allowed: access.allowed, billingActionRequired: access.billingActionRequired }}
        plans={plans}
        initialPlanKey={params.plan ?? null}
        initialInterval={params.interval === "yearly" ? "yearly" : params.interval === "monthly" ? "monthly" : null}
        mockCompleteAvailable={
          process.env.VERCEL_ENV !== "production" &&
          process.env.NODE_ENV !== "production" &&
          process.env.SAAS_BILLING_PROVIDER === "mock" &&
          process.env.SAAS_MOCK_WEBHOOK_ENABLED === "true"
        }
        tax={(() => {
          const t = getTaxConfig();
          return { rateBps: t.rateBps, rateLabel: t.rateLabel, demo: t.demo };
        })()}
        hasBillingProfile={Boolean(billingProfile)}
      />
    </div>
  );
}
