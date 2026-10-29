import { withApiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/services/result";
import { getPublishedCatalog } from "@/lib/platform/commercial-catalog";
import { getPricedPlan } from "@/lib/saas-billing/catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/billing/plans
 * Satın alınabilir planların fiyatlı görünümü. Onaylı fiyat yoksa tutar
 * SANDBOX işaretli döner ve checkout kapalıdır — gerçek fiyat uydurulmaz.
 */
export const GET = withApiHandler(
  async () => {
    const { catalog, version } = await getPublishedCatalog();
    const plans = [];
    for (const p of catalog.plans) {
      if (p.status !== "active" || p.legacy) continue;
      const monthly = await getPricedPlan(p.key, "monthly");
      const yearly = await getPricedPlan(p.key, "yearly");
      if (!monthly || !yearly) continue;
      plans.push({
        planKey: p.key,
        label: p.label,
        description: p.description,
        catalogVersion: version,
        currency: monthly.currency,
        usdAmountMinor: monthly.usdAmountMinor,
        limits: p.limits,
        includedModules: p.includedModules,
        customQuote: monthly.customQuote,
        monthly: {
          amountMinor: monthly.amountMinor,
          displayTotal: monthly.displayTotal,
          approved: monthly.approved,
          sandbox: monthly.sandbox,
          renewalNote: monthly.renewalNote,
          taxNote: monthly.taxNote,
        },
        yearly: {
          amountMinor: yearly.amountMinor,
          displayTotal: yearly.displayTotal,
          displayMonthlyEquivalent: yearly.displayMonthlyEquivalent,
          approved: yearly.approved,
          sandbox: yearly.sandbox,
          renewalNote: yearly.renewalNote,
          taxNote: yearly.taxNote,
        },
      });
    }
    return ok({ plans });
  },
  { permission: "billing:read" }
);
