import { getPublishedCatalog } from "../platform/commercial-catalog";
import { cachePublic } from "../platform/public-cache";
import { pricePlanFromCatalog } from "./catalog";
import type { PricingPlanView } from "@/components/site/pricing-plans";

/**
 * Ana sayfanın paket kartları: yayındaki katalogdan tek okuma, tek önbellek. Katalog yayınlanınca
 * `recordPublishedVersion` önbelleği temizler. Satın alma tutarı burayı KULLANMAZ, her adımda yeniden okur.
 */
async function buildPricingViews(): Promise<{ views: PricingPlanView[]; anyDemo: boolean }> {
  const { catalog, version } = await getPublishedCatalog();
  const labelOf = new Map(catalog.modules.map((m) => [m.key, m.label]));
  const views: PricingPlanView[] = [];
  let anyDemo = false;
  for (const p of catalog.plans) {
    if (p.status !== "active" || p.legacy) continue;
    const monthly = pricePlanFromCatalog(catalog, version, p.key, "monthly");
    const yearly = pricePlanFromCatalog(catalog, version, p.key, "yearly");
    if (!monthly || !yearly) continue;
    const customQuote = monthly.customQuote;
    let savingsPercent: number | null = null;
    if (!customQuote && monthly.approved && yearly.approved && monthly.amountMinor > 0 && yearly.amountMinor > 0 && yearly.amountMinor < 12 * monthly.amountMinor) {
      savingsPercent = Math.round((1 - yearly.amountMinor / (12 * monthly.amountMinor)) * 100);
    }
    if (monthly.sandbox && monthly.amountMinor > 0) anyDemo = true;
    views.push({
      key: p.key,
      label: p.label,
      description: p.description || null,
      limits: { students: p.limits.students, users: p.limits.users, branches: p.limits.branches },
      moduleLabels: p.includedModules.map((k) => labelOf.get(k) ?? k),
      customQuote,
      savingsPercent,
      monthly: { amountMinor: monthly.amountMinor, displayTotal: monthly.displayTotal, approved: monthly.approved, sandbox: monthly.sandbox, taxNote: monthly.taxNote },
      yearly: {
        amountMinor: yearly.amountMinor,
        displayTotal: yearly.displayTotal,
        displayMonthlyEquivalent: yearly.displayMonthlyEquivalent,
        approved: yearly.approved,
        sandbox: yearly.sandbox,
        taxNote: yearly.taxNote,
      },
    });
  }
  return { views, anyDemo };
}

export const getPricingViews = cachePublic(buildPricingViews, "pricing-views");
