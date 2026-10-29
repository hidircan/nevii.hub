/**
 * Fatura paneli görünüm tipleri — server page ham kayıtları bu şekle
 * indirger (istemciye gereksiz alan taşınmaz).
 */

export type SubscriptionView = {
  planKey: string;
  planLabel: string;
  status: string;
  billingInterval: string;
  displayTotal: string;
  displayMonthlyEquivalent: string | null;
  renewalNote: string;
  taxNote: string;
  sandbox: boolean;
  trialEndsAt: string | null;
  paidThrough: string | null;
  cancelAtPeriodEnd: boolean;
  paymentOnFile: boolean;
  provider: string;
  executionModel: string | null;
  /** Kampanya bilgisi (yoksa null) — davet ekranıyla aynı dilde gösterilir. */
  campaign: {
    name: string;
    scheduleHeadline: string;
    scheduleLines: string[];
    afterNote: string;
  } | null;
};

export type AttemptView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  displayAmount: string;
  kind: string;
  status: string;
  createdAt: string;
};

export type SaasAccessDecisionShaped = {
  allowed: boolean;
  billingActionRequired: boolean;
};

export type BillingPlanPriceView = {
  amountMinor: number;
  displayTotal: string;
  displayMonthlyEquivalent?: string | null;
  approved: boolean;
  sandbox: boolean;
  renewalNote: string;
  taxNote: string;
};

export type BillingPlanOption = {
  key: string;
  label: string;
  /** Paket açıklaması (örn. "ÖRNEK FİYAT" işareti) — varsa kartta gösterilir. */
  description: string | null;
  monthly: BillingPlanPriceView;
  yearly: BillingPlanPriceView;
};
