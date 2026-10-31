/**
 * SaaS fiyat kataloğu görünümü — MEVCUT commercial-catalog'un ÜSTÜNDE ince
 * bir katman. Paralel ikinci paket sistemi KURULMAZ.
 *
 * Ek sorumluluklar (V1):
 * - Aylık/yıllık + para birimi + vergi gösterimi (KDV hariç, hesaplama yok)
 * - Fiyat geçerlilik tarihi ve fiyat sürümü (PolicyVersion)
 * - Yıllık = "yılda tek tahsilat"; aylık eşdeğer gösteriminde toplam + yenileme koşulu
 * - Taslak/onaylı ayrımı: onaylı fiyat yoksa GERÇEK fiyat uydurulmaz;
 *   test tutarları SANDBOX işaretli, gerçek checkout fiyat onayı yokken kapalı
 * - Kabul edilen fiyat/koşul snapshot'ı (katalog değişimi mevcut tahsilatı değiştirmez)
 */
import { getPublishedCatalog, TAX_NOTE } from "../platform/commercial-catalog";
import { planLabel } from "../platform/entitlements";
import {
  formatMinorTR,
  monthlyEquivalentOfYearly,
  type SaasBillingInterval,
  type SaasPriceSnapshot,
} from "./types";
import { formatExVat, type TaxBreakdown } from "./tax";

export const SAAS_TAX_NOTE = TAX_NOTE;
export const SAAS_SANDBOX_NOTE = "SANDBOX test tutarıdır; gerçek ticari fiyat değildir.";

export type SaasPricedPlan = {
  planKey: string;
  planLabel: string;
  catalogVersion: number | null;
  billingInterval: SaasBillingInterval;
  currency: import("./types").SaasCurrency;
  /** Onaylı USD liste fiyatı (yoksa null — kur çevrimiyle uydurulmaz). */
  usdAmountMinor: number | null;
  /** Dönem tahsilat tutarı (minor). */
  amountMinor: number;
  /** Yıllıkta aylık eşdeğer (gösterim, minor). */
  monthlyEquivalentMinor: number | null;
  displayTotal: string;
  displayMonthlyEquivalent: string | null;
  renewalNote: string;
  taxNote: string;
  pricePublished: boolean;
  /** Onaylı fiyat var mı? Yoksa checkout kapalı, tutar SANDBOX. */
  approved: boolean;
  sandbox: boolean;
  customQuote: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export function renewalNoteFor(interval: SaasBillingInterval): string {
  return interval === "yearly"
    ? "Yılda tek tahsilat yapılır; dönem sonunda aynı koşullarla otomatik yenilenir. Dilediğinizde iptal edebilirsiniz; iptalde ödenmiş süre sonuna kadar erişim sürer."
    : "Her ay otomatik tahsilat yapılır. Dilediğinizde iptal edebilirsiniz; iptalde ödenmiş süre sonuna kadar erişim sürer.";
}

/**
 * Yayındaki katalogdan fiyatlı plan görünümü. Fiyat yayınlanmamışsa
 * (pricePublished=false) tutar 0 + sandbox + approved=false döner —
 * gerçek fiyat ASLA uydurulmaz, checkout kapalı tutulur.
 */
export async function getPricedPlan(
  planKey: string,
  interval: SaasBillingInterval
): Promise<SaasPricedPlan | null> {
  const { catalog, version } = await getPublishedCatalog();
  return pricePlanFromCatalog(catalog, version, planKey, interval);
}

/** Saf hesap: aynı katalogdan birden çok paket fiyatlanırken her seferinde yeniden okumaz. */
export function pricePlanFromCatalog(
  catalog: Awaited<ReturnType<typeof getPublishedCatalog>>["catalog"],
  version: number | null,
  planKey: string,
  interval: SaasBillingInterval
): SaasPricedPlan | null {
  const plan = catalog.plans.find((p) => p.key === planKey);
  if (!plan || plan.status !== "active") return null;
  const customQuote = plan.pricing === "custom_quote";
  const approved = plan.pricePublished && !customQuote;
  const amountMinor =
    interval === "yearly" ? plan.basePriceYearlyMinor : plan.basePriceMonthlyMinor;
  const monthlyEquivalentMinor =
    interval === "yearly" ? monthlyEquivalentOfYearly(amountMinor) : null;
  return {
    planKey: plan.key,
    planLabel: plan.label,
    catalogVersion: version,
    billingInterval: interval,
    currency: "TRY",
    // USD liste fiyatı ayrı yayın gerektirir; kur çevrimiyle uydurulmaz.
    usdAmountMinor: null,
    amountMinor,
    monthlyEquivalentMinor,
    displayTotal: formatExVat(amountMinor),
    displayMonthlyEquivalent:
      monthlyEquivalentMinor === null ? null : formatExVat(monthlyEquivalentMinor),
    renewalNote: renewalNoteFor(interval),
    taxNote: SAAS_TAX_NOTE,
    pricePublished: plan.pricePublished,
    approved,
    sandbox: !approved,
    customQuote,
    // V1: katalog sürümü fiyat sürümüdür; geçerlilik penceresi yayın
    // zamanından türetilir (ayrı geçerlilik alanı V2'de katalog şemasına eklenir).
    validFrom: null,
    validTo: null,
  };
}

/** Ödeme öncesi kullanıcıya gösterilecek özet (tutar, periyot, yenileme, iptal). */
export function prePaymentSummary(p: SaasPricedPlan): {
  total: string;
  period: string;
  renewal: string;
  tax: string;
  sandbox: boolean;
} {
  return {
    total: p.displayTotal,
    period:
      p.billingInterval === "yearly"
        ? `Yıllık (yılda tek tahsilat${p.displayMonthlyEquivalent ? `, aylık eşdeğer ${p.displayMonthlyEquivalent}` : ""})`
        : "Aylık",
    renewal: p.renewalNote,
    tax: p.taxNote,
    sandbox: p.sandbox,
  };
}

/**
 * Kabul anında dondurulan snapshot — sonraki katalog değişimleri etkilemez.
 * currency: TRY varsayılan; USD ancak ayrı onaylı USD fiyat kaydıyla
 * (liste fiyatı sahibi yayınlamadan USD snapshot kurulmaz).
 */
export function buildPriceSnapshot(args: {
  plan: Pick<
    SaasPricedPlan,
    | "planKey"
    | "planLabel"
    | "catalogVersion"
    | "billingInterval"
    | "currency"
    | "amountMinor"
    | "monthlyEquivalentMinor"
    | "taxNote"
    | "renewalNote"
    | "sandbox"
  >;
  limits: { students: number | null; users: number | null; branches: number | null };
  includedModules: string[];
  campaignCode: string | null;
  campaignNote: string | null;
  postCampaignNote: string | null;
  acceptedBy: string;
  nowIso?: string;
  /** Kabul anındaki vergi kırılımı (checkout/trial hesaplar; yoksa null kalır). */
  tax?: TaxBreakdown | null;
}): SaasPriceSnapshot {
  return {
    planKey: args.plan.planKey,
    planLabel: args.plan.planLabel || planLabel(args.plan.planKey),
    catalogVersion: args.plan.catalogVersion,
    billingInterval: args.plan.billingInterval,
    currency: args.plan.currency,
    amountMinor: args.plan.amountMinor,
    // Eşdeğer, HER ZAMAN yürürlükteki tutardan türetilir: kampanya
    // indirimi monthlyEquivalentMinor'ı liste değerinde bırakmamalı.
    monthlyEquivalentMinor:
      args.plan.billingInterval === "yearly"
        ? monthlyEquivalentOfYearly(args.plan.amountMinor)
        : null,
    campaignCode: args.campaignCode,
    campaignNote: args.campaignNote,
    postCampaignNote: args.postCampaignNote,
    taxRateBps: args.tax?.rateBps ?? null,
    taxAmountMinor: args.tax?.taxMinor ?? null,
    totalWithTaxMinor: args.tax?.totalMinor ?? null,
    taxDemo: args.tax?.demo ?? false,
    limits: args.limits,
    includedModules: args.includedModules,
    taxNote: args.plan.taxNote,
    renewalNote: args.plan.renewalNote,
    acceptedAt: args.nowIso ?? new Date().toISOString(),
    acceptedBy: args.acceptedBy,
    sandbox: args.plan.sandbox,
  };
}
