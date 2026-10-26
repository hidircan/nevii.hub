/**
 * SaaS abonelik katmanı — tipler ve minor-unit para yardımcıları.
 *
 * Kurum→NeviiHub tahsilatı, öğrenci→kurum finansmanından (Payment /
 * StudentContract / TeacherPayout) TAMAMEN AYRIDIR. Bu dosyadaki hiçbir tip
 * o tablolara referans vermez.
 *
 * Para: HER ZAMAN minor-unit Int (TRY kuruş). Float ile para hesabı YASAK.
 */

export const SAAS_SUBSCRIPTION_STATUSES = [
  "pending",
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
  "expired",
] as const;
export type SaasSubscriptionStatus = (typeof SAAS_SUBSCRIPTION_STATUSES)[number];

export const SAAS_BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type SaasBillingInterval = (typeof SAAS_BILLING_INTERVALS)[number];

export const SAAS_ATTEMPT_STATUSES = ["pending", "succeeded", "failed", "voided"] as const;
export type SaasAttemptStatus = (typeof SAAS_ATTEMPT_STATUSES)[number];

export const SAAS_ATTEMPT_KINDS = ["charge", "refund", "chargeback"] as const;
export type SaasAttemptKind = (typeof SAAS_ATTEMPT_KINDS)[number];

export const SAAS_WEBHOOK_STATUSES = ["received", "processed", "failed", "ignored"] as const;
export type SaasWebhookStatus = (typeof SAAS_WEBHOOK_STATUSES)[number];

export const SAAS_INVITATION_STATUSES = ["pending", "consumed", "expired", "revoked"] as const;
export type SaasInvitationStatus = (typeof SAAS_INVITATION_STATUSES)[number];

export const SAAS_TRIAL_REQUEST_STATUSES = ["pending", "approved", "rejected", "converted"] as const;
export type SaasTrialRequestStatus = (typeof SAAS_TRIAL_REQUEST_STATUSES)[number];

export type SaasTrialRequestRecord = {
  id: string;
  institutionName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  status: SaasTrialRequestStatus;
  tenantId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type SaasCurrency = "TRY";

/** Kabul edilen fiyat/koşul snapshot'ı — katalog değişimi bunu değiştirmez. */
export type SaasPriceSnapshot = {
  planKey: string;
  planLabel: string;
  catalogVersion: number | null;
  billingInterval: SaasBillingInterval;
  currency: SaasCurrency;
  /** Dönem tahsilat tutarı (minor). */
  amountMinor: number;
  /** Yıllıkta aylık eşdeğer (yalnız gösterim, minor, yuvarlanmış). */
  monthlyEquivalentMinor: number | null;
  campaignCode: string | null;
  campaignNote: string | null;
  /** Kampanya sonrası uygulanacak fiyatın açıklaması. */
  postCampaignNote: string | null;
  limits: { students: number | null; users: number | null; branches: number | null };
  includedModules: string[];
  /** Vergi gösterimi: V1'de tutarlar KDV hariçtir, hesaplama yok. */
  taxNote: string;
  /** Yenileme koşulu (ödeme öncesi kullanıcıya gösterilen metin). */
  renewalNote: string;
  acceptedAt: string;
  acceptedBy: string;
  /** SANDBOX test tutarı mı? Gerçek fiyat onayı yokken true. */
  sandbox: boolean;
  /**
   * Deneme sahibi e-posta hash'i (SHA-256, küçük harf) — tekrarlı deneme
   * abuse kontrolü için. E-postanın kendisi saklanmaz (veri minimizasyonu).
   */
  trialOwnerHash?: string | null;
};

export type SaasSubscriptionRecord = {
  id: string;
  tenantId: string;
  planKey: string;
  catalogVersion: number | null;
  status: SaasSubscriptionStatus;
  billingInterval: SaasBillingInterval;
  currency: SaasCurrency;
  priceSnapshot: SaasPriceSnapshot;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  paidThrough: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string;
  providerCustomerRef: string | null;
  providerSubscriptionRef: string | null;
  lastWebhookAt: string | null;
  lastReconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaasCollectionAttemptRecord = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
  currency: SaasCurrency;
  status: SaasAttemptStatus;
  kind: SaasAttemptKind;
  attemptNo: number;
  idempotencyKey: string;
  providerRef: string | null;
  providerEventId: string | null;
  error: string | null;
  createdAt: string;
};

export type SaasWebhookEventRecord = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  tenantId: string | null;
  subscriptionId: string | null;
  payload: Record<string, unknown>;
  signatureValid: boolean;
  status: SaasWebhookStatus;
  processedAt: string | null;
  error: string | null;
  createdAt: string;
};

export type SaasCampaignRecord = {
  id: string;
  name: string;
  tenantId: string | null;
  code: string;
  discountType: "fixed_minor" | "percent";
  amountMinor: number | null;
  percent: number | null;
  intervalScope: "monthly" | "yearly" | "both";
  validFrom: string | null;
  validTo: string | null;
  maxRenewals: number | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  postCampaignNote: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type SaasCheckoutInvitationRecord = {
  id: string;
  tenantId: string;
  proposalId: string | null;
  proposalVersion: number | null;
  campaignId: string | null;
  planKey: string;
  billingInterval: SaasBillingInterval;
  currency: SaasCurrency;
  displayAmountMinor: number;
  tokenHash: string;
  status: SaasInvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdBy: string;
  createdAt: string;
};

// ───────────── Minor-unit para (float YOK) ─────────────

/** Minor → "1.234,56 ₺" gösterimi. */
export function formatMinorTR(minor: number, currency: SaasCurrency = "TRY"): string {
  if (!Number.isInteger(minor) || minor < 0) throw new Error("Geçersiz tutar (minor-unit tamsayı olmalı).");
  const major = Math.floor(minor / 100);
  const rest = minor % 100;
  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const symbol = currency === "TRY" ? "₺" : currency;
  return `${grouped},${rest.toString().padStart(2, "0")} ${symbol}`;
}

/** Yüzde indirim — tamamı tamsayı aritmetiği, aşağı yuvarlanır. */
export function applyPercentDiscount(amountMinor: number, percent: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new Error("Geçersiz tutar.");
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Geçersiz yüzde.");
  return Math.floor((amountMinor * (100 - percent)) / 100);
}

/** Sabit indirim — sonuç negatife düşmez. */
export function applyFixedDiscount(amountMinor: number, discountMinor: number): number {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(discountMinor)) throw new Error("Geçersiz tutar.");
  return Math.max(0, amountMinor - Math.max(0, discountMinor));
}

/** Yıllık tutardan aylık eşdeğer (gösterim amaçlı, aşağı yuvarlanır). */
export function monthlyEquivalentOfYearly(yearlyMinor: number): number {
  if (!Number.isInteger(yearlyMinor) || yearlyMinor < 0) throw new Error("Geçersiz tutar.");
  return Math.floor(yearlyMinor / 12);
}

export function isSaasSubscriptionStatus(v: string): v is SaasSubscriptionStatus {
  return (SAAS_SUBSCRIPTION_STATUSES as readonly string[]).includes(v);
}

export function isSaasBillingInterval(v: string): v is SaasBillingInterval {
  return (SAAS_BILLING_INTERVALS as readonly string[]).includes(v);
}
