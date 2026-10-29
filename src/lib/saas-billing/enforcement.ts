/**
 * SaaS erişim kısıtlama (enforcement).
 *
 * Kurallar:
 * - Varsayılan KAPALI: mevcut kurumlar açıkça migrate edilene kadar
 *   legacy/managed kapsamda kalır, bu kural geçmişe otomatik uygulanmaz.
 *   Kurum bazlı `billing.enforcement` + audit ile kontrollü açılır.
 * - HYPER_ADMIN platform erişimi tenant borcu yüzünden ASLA kilitlenmez.
 * - Kısıt: kullanıcı SİLİNMEZ, active=false yapılmaz. Kurum sahibi giriş
 *   yapar; ödeme ekranı, kart güncelleme, borç ödeme, iptal ve destek açık.
 * - Yalnız menü gizleme YETERSİZ: backend API + mobil de uygular
 *   (`assertSaasAccess`). Alternatif route/eski token/cache ile atlanamaz:
 *   karar her istekte sunucuda, güncel kayıt üzerinden verilir.
 * - Ek ücretsiz tolerans varsayılan 0 gün (`billing.graceDays`, NeviiOS'tan).
 * - Ödeme doğrulanınca erişim OTOMATİK geri gelir (durum active + paidThrough).
 * - Offline erişim: istemci en son doğrulanmış hakkı en fazla 24 saat
 *   önbelleğe alabilir; sonrası fail-closed (çevrimiçi doğrulama gerekir).
 *   Bu sınır istemci sürümüyle ayrıca duyurulur.
 */
import { fail, ok, type ServiceResult } from "../services/result";
import type { AppRole } from "../auth/types";
import { resolveSetting } from "../platform/resolve";
import { getSaasSubscription } from "./store";
import type { SaasSubscriptionRecord, SaasSubscriptionStatus } from "./types";

/** Offline entitlement önbellek üst sınırı (saat). */
export const OFFLINE_ENTITLEMENT_CACHE_HOURS = 24;

export type SaasAccessDecision = {
  allowed: boolean;
  /** legacy: enforcement kapalı → kısıt yok */
  scope: "legacy" | "enforced";
  status: SaasSubscriptionStatus | "none";
  /** Ödeme/borç ekranına yönlendirme gerekir mi? */
  billingActionRequired: boolean;
  /** Yetkisiz rollere gösterilebilecek güvenli mesaj (finansal detay YOK). */
  safeMessage: string | null;
  paidThrough: string | null;
  exceptionActive: boolean;
};

export const SUBSCRIPTION_INACTIVE_MESSAGE =
  "Kurum aboneliği etkin değil. Kurum sahibi ödeme ekranından aboneliği yenileyebilir.";

async function getBillingSetting<T>(tenantId: string, key: string, fallback: T): Promise<T> {
  try {
    const r = await resolveSetting({ tenantId }, key);
    if (!r) return fallback;
    return (r.effectiveValue as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Enforcement bayrağı önbelleği (süreç-içi, 30 sn TTL). YALNIZCA bayrak
 * önbelleğe alınır — abonelik kararı (durum/paidThrough/istisna) her istekte
 * taze okunur, ödeme sonrası açılma en fazla 30 sn gecikir. Her istekte
 * sağlayıcıya gidilmez; yerel entitlement kaydı kullanılır.
 */
const enforcementFlagCache = new Map<string, { value: boolean; expiresAt: number }>();
const ENFORCEMENT_FLAG_TTL_MS = 30_000;

export function __clearEnforcementCacheForTests(): void {
  enforcementFlagCache.clear();
}

export async function isEnforcementEnabled(tenantId: string): Promise<boolean> {
  const now = Date.now();
  const hit = enforcementFlagCache.get(tenantId);
  if (hit && now < hit.expiresAt) return hit.value;
  const value = await getBillingSetting(tenantId, "billing.enforcement", false);
  enforcementFlagCache.set(tenantId, { value, expiresAt: now + ENFORCEMENT_FLAG_TTL_MS });
  return value;
}

export async function getGraceDays(tenantId: string): Promise<number> {
  const v = await getBillingSetting<number>(tenantId, "billing.graceDays", 0);
  return typeof v === "number" && v >= 0 && v <= 30 ? Math.floor(v) : 0;
}

export async function getTrialPlanKey(): Promise<string> {
  // Platform kapsamı: tenant bağımsız okunur; okunamazsa güvenli varsayılan.
  const v = await getBillingSetting<string>("platform", "billing.trialPlanKey", "core");
  return typeof v === "string" && v.length >= 2 ? v : "core";
}

type BillingException = { until: string; reason: string; by: string } | null;

async function getActiveException(tenantId: string, nowMs: number): Promise<BillingException> {
  const v = await getBillingSetting<BillingException>(tenantId, "billing.exception", null);
  if (!v || typeof v !== "object" || !v.until) return null;
  const untilMs = new Date(v.until).getTime();
  if (Number.isNaN(untilMs) || untilMs <= nowMs) return null;
  return v;
}

/**
 * Kurumun işlevsel erişim kararı. Güvenli yerel entitlement kaydı üzerinden
 * verilir; her istekte sağlayıcıya GİDİLMEZ (invalidation: webhook/mutabakat/
 * ödeme sonrası durum değişimi).
 */
export async function decideSaasAccess(
  tenantId: string,
  nowIso?: string
): Promise<SaasAccessDecision> {
  const now = nowIso ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const enforced = await isEnforcementEnabled(tenantId);
  if (!enforced) {
    return {
      allowed: true,
      scope: "legacy",
      status: "none",
      billingActionRequired: false,
      safeMessage: null,
      paidThrough: null,
      exceptionActive: false,
    };
  }
  const sub = await getSaasSubscription(tenantId);
  const exception = await getActiveException(tenantId, nowMs);
  if (exception) {
    return {
      allowed: true,
      scope: "enforced",
      status: sub?.status ?? "none",
      billingActionRequired: true,
      safeMessage: null,
      paidThrough: sub?.paidThrough ?? null,
      exceptionActive: true,
    };
  }
  if (!sub) {
    return {
      allowed: false,
      scope: "enforced",
      status: "none",
      billingActionRequired: true,
      safeMessage: SUBSCRIPTION_INACTIVE_MESSAGE,
      paidThrough: null,
      exceptionActive: false,
    };
  }
  return decideFromSubscription(sub, tenantId, nowMs);
}

async function decideFromSubscription(
  sub: SaasSubscriptionRecord,
  tenantId: string,
  nowMs: number
): Promise<SaasAccessDecision> {
  const graceMs = (await getGraceDays(tenantId)) * 24 * 3600 * 1000;
  const paidThroughMs = sub.paidThrough ? new Date(sub.paidThrough).getTime() : NaN;
  const trialEndMs = sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : NaN;
  const withinPaid = !Number.isNaN(paidThroughMs) && nowMs <= paidThroughMs + graceMs;
  const withinTrial =
    sub.status === "trialing" && !Number.isNaN(trialEndMs) && nowMs <= trialEndMs;

  // Dönem sonunda iptal: ödenmiş süre sonuna kadar erişim sürer.
  if (sub.status === "canceled" && sub.cancelAtPeriodEnd && withinPaid) {
    return {
      allowed: true,
      scope: "enforced",
      status: sub.status,
      billingActionRequired: true,
      safeMessage: null,
      paidThrough: sub.paidThrough,
      exceptionActive: false,
    };
  }
  if ((sub.status === "active" || sub.status === "past_due") && (withinPaid || withinTrial)) {
    return {
      allowed: true,
      scope: "enforced",
      status: sub.status,
      billingActionRequired: sub.status === "past_due",
      safeMessage: null,
      paidThrough: sub.paidThrough,
      exceptionActive: false,
    };
  }
  if (withinTrial) {
    return {
      allowed: true,
      scope: "enforced",
      status: sub.status,
      billingActionRequired: false,
      safeMessage: null,
      paidThrough: sub.paidThrough,
      exceptionActive: false,
    };
  }
  // suspended/unpaid, süresi dolmuş trial, borcu doğrulanmış past_due → kısıtlı.
  if (sub.status === "past_due" && !withinPaid) {
    return restricted(sub, true);
  }
  if (sub.status === "suspended" || sub.status === "expired" || sub.status === "canceled") {
    return restricted(sub, true);
  }
  if (sub.status === "trialing" && !withinTrial) {
    // Deneme bitti, kart/abonelik yok → kısıtlı, otomatik borç YOK.
    return restricted(sub, true);
  }
  // pending: ödeme bekleniyor → kısıtlı.
  return restricted(sub, true);
}

function restricted(sub: SaasSubscriptionRecord, billingActionRequired: boolean): SaasAccessDecision {
  return {
    allowed: false,
    scope: "enforced",
    status: sub.status,
    billingActionRequired,
    safeMessage: SUBSCRIPTION_INACTIVE_MESSAGE,
    paidThrough: sub.paidThrough,
    exceptionActive: false,
  };
}

/**
 * API/mobil guard'ı. HYPER_ADMIN her zaman geçer (platform erişimi tenant
 * borcuyla kilitlenmez). `billingAllowedPaths` ödeme/kart/destek ekranları
 * için kısıttan muaftır.
 */
export async function assertSaasAccess(args: {
  role: AppRole;
  tenantId: string;
  path: string;
}): Promise<ServiceResult<SaasAccessDecision>> {
  if (args.role === "HYPER_ADMIN") {
    return ok({
      allowed: true,
      scope: "enforced",
      status: "none",
      billingActionRequired: false,
      safeMessage: null,
      paidThrough: null,
      exceptionActive: false,
    });
  }
  if (isBillingExemptPath(args.path)) {
    return ok({
      allowed: true,
      scope: "enforced",
      status: "none",
      billingActionRequired: false,
      safeMessage: null,
      paidThrough: null,
      exceptionActive: false,
    });
  }
  const decision = await decideSaasAccess(args.tenantId);
  if (decision.allowed) return ok(decision);
  return fail("FORBIDDEN", decision.safeMessage ?? SUBSCRIPTION_INACTIVE_MESSAGE, {
    code: "SUBSCRIPTION_INACTIVE",
    billingActionRequired: true,
  });
}

/** Kısıtlıyken açık kalan yollar: ödeme, kart, iptal/destek, hesap. */
export function isBillingExemptPath(path: string): boolean {
  const p = path.split("?")[0];
  return (
    p.startsWith("/api/v1/billing/") ||
    p.startsWith("/api/v1/auth/") ||
    p.startsWith("/api/v1/account/") ||
    p === "/api/v1/support/tickets" ||
    p.startsWith("/fatura") ||
    p.startsWith("/abonelik") ||
    p.startsWith("/odeme") ||
    p.startsWith("/destek") ||
    p.startsWith("/login") ||
    p.startsWith("/hesap")
  );
}
