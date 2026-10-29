/**
 * SaaS abonelik durum makinesi.
 *
 * Yerel durumlar: pending | trialing | active | past_due | suspended |
 * canceled | expired
 *
 * Kurallar (V1):
 * - Tüm tarih hesapları SUNUCUDA yapılır (istemci tarihi güvenilmez).
 * - Sırası bozuk/geciken olay eski duruma geri döndürmez (tek yönlü koruma).
 * - Yıllık üyelik aylık kontrolle kapatılmaz (dönem sonu + tolerans bazlı).
 * - Dönem sonunda iptal → ödenmiş süre sonuna kadar erişim sürer.
 * - Upgrade: ek haklar ödeme doğrulanmadan VERİLMEZ.
 * - Downgrade: varsayılan SONRAKİ döneme planlanır; kullanım yeni limitin
 *   üstündeyse veri SİLİNMEZ, yeni eklemeler sınırlanır.
 * - İade/chargeback ayrı kayıt (kind), geçmiş ödeme satırı silinmez/değişmez.
 * - İade politikası metni uydurulmaz — hukuki onay bekleyen taslaktır.
 */
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import type {
  SaasBillingInterval,
  SaasCollectionAttemptRecord,
  SaasPriceSnapshot,
  SaasSubscriptionRecord,
  SaasSubscriptionStatus,
} from "./types";
import {
  getSaasSubscription,
  listSaasAttempts,
  recordSaasAttempt,
  updateSaasAttempt,
  upsertSaasSubscription,
} from "./store";
import { getSaasProvider } from "./provider-adapter";

/** Durum önceliği — düşük öncelikli olay yüksek öncelikli durumu geri alamaz. */
const STATUS_RANK: Record<SaasSubscriptionStatus, number> = {
  expired: 0,
  canceled: 1,
  pending: 2,
  trialing: 3,
  suspended: 4,
  past_due: 5,
  active: 6,
};

/**
 * Sağlayıcı durum eşlemesi — HER SAĞLAYICI kendi eşlemesini verir, domain
 * dosyasında sağlayıcı adı geçmez. Bilinmeyen değer fail-closed: eşleşme
 * yoksa durum değişmez, olay "ignored" işaretlenir.
 */
export function mapProviderStatus(
  providerId: import("./types").SaasProviderId,
  providerStatus: string
): SaasSubscriptionStatus | null {
  return getSaasProvider(providerId).mapStatus(providerStatus);
}

/** Geçişe izin var mı? (sırası bozuk olay koruması dahil) */
export function canTransition(
  from: SaasSubscriptionStatus,
  to: SaasSubscriptionStatus,
  opts?: { allowReactivation?: boolean }
): boolean {
  if (from === to) return true;
  // canceled/expired → active/past_due yalnız açık yeniden etkinleştirme ile.
  if ((from === "canceled" || from === "expired") && (to === "active" || to === "past_due")) {
    return opts?.allowReactivation === true;
  }
  // canceled → expired doğal akış (dönem sonu).
  if (from === "canceled" && to === "expired") return true;
  // Genel kural: rank düşüren geçişler gecikmiş/bozuk olay olabilir.
  // İzin verilen düşüşler: active→past_due→suspended→canceled zinciri.
  const allowedDrops: Record<string, SaasSubscriptionStatus[]> = {
    active: ["past_due", "suspended", "canceled", "expired"],
    past_due: ["suspended", "canceled", "active"],
    suspended: ["canceled", "expired", "active", "past_due"],
    trialing: ["active", "expired", "canceled", "suspended"],
    pending: ["trialing", "active", "expired", "canceled"],
  };
  if (STATUS_RANK[to] < STATUS_RANK[from]) {
    return allowedDrops[from]?.includes(to) ?? false;
  }
  return true;
}

/** Dönem matematiği periods.ts'tedir (döngüsel bağımlılık yok). */
import { addPeriod } from "./periods";
export { addPeriod, addPeriodInTz } from "./periods";

export function newSubscriptionId(): string {
  return uid("saas_sub");
}

/** Yeni abonelik taslağı (ödeme doğrulanmadan hak vermez → pending). */
export function buildPendingSubscription(args: {
  tenantId: string;
  planKey: string;
  catalogVersion: number | null;
  billingInterval: SaasBillingInterval;
  priceSnapshot: SaasPriceSnapshot;
  /** Sağlayıcı ZORUNLU seçimdir — sessiz varsayılan yok. */
  provider: import("./types").SaasProviderId;
  executionModel?: import("./types").SaasExecutionModel | null;
  merchantAccount?: string;
  billingTimeZone?: string;
  billingEmail?: string;
  billingUserIp?: string;
  nowIso?: string;
}): SaasSubscriptionRecord {
  const now = args.nowIso ?? new Date().toISOString();
  return {
    id: newSubscriptionId(),
    tenantId: args.tenantId,
    planKey: args.planKey,
    catalogVersion: args.catalogVersion,
    status: "pending",
    billingInterval: args.billingInterval,
    currency: "TRY",
    priceSnapshot: args.priceSnapshot,
    trialStartsAt: null,
    trialEndsAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    paidThrough: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    provider: args.provider,
    executionModel: args.executionModel ?? null,
    merchantAccount: args.merchantAccount ?? "",
    providerCustomerRef: null,
    providerSubscriptionRef: null,
    providerCardRef: null,
    providerLinks: [],
    billingTimeZone: args.billingTimeZone || "UTC",
    billingEmail: args.billingEmail || "",
    billingUserIp: args.billingUserIp || "",
    lastWebhookAt: null,
    lastReconciledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Sağlayıcı bağlantısı ekler (geçiş/rollback/audit izi korunur, silinmez). */
export function addProviderLink(
  sub: SaasSubscriptionRecord,
  link: Omit<import("./types").SaasProviderLink, "at">,
  nowIso?: string
): SaasSubscriptionRecord {
  const at = nowIso ?? new Date().toISOString();
  return { ...sub, providerLinks: [...(sub.providerLinks ?? []), { ...link, at }], updatedAt: at };
}

/**
 * Doğrulanmış ödeme sonrası dönem ilerletme — sağlayıcı-bağımsız çekirdeğe
 * delege eder (collections.applyCollectionSuccess). Sağlayıcı/merchant/para
 * birimi belirtilmezse abonelik kaydındaki değerler kullanılır.
 */
export async function applyVerifiedPayment(args: {
  tenantId: string;
  amountMinor: number;
  providerRef: string;
  providerEventId: string;
  idempotencyKey: string;
  provider?: import("./types").SaasProviderId;
  merchantAccount?: string;
  currency?: import("./types").SaasCurrency;
  nowIso?: string;
}): Promise<ServiceResult<{ subscription: SaasSubscriptionRecord; duplicate: boolean }>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const { applyCollectionSuccess } = await import("./collections");
  return applyCollectionSuccess({
    tenantId: args.tenantId,
    amountMinor: args.amountMinor,
    currency: args.currency ?? sub.currency,
    provider: args.provider ?? sub.provider,
    merchantAccount: args.merchantAccount ?? sub.merchantAccount,
    providerRef: args.providerRef,
    providerEventId: args.providerEventId,
    idempotencyKey: args.idempotencyKey,
    nowIso: args.nowIso,
  });
}

/** Başarısız ödeme kaydı → past_due (tek başına erişim kesmez; enforcement karar verir). */
export async function applyFailedPayment(args: {
  tenantId: string;
  error: string;
  providerEventId: string;
  idempotencyKey: string;
  provider?: import("./types").SaasProviderId;
  merchantAccount?: string;
  providerRef?: string | null;
  retryable?: boolean | null;
  nowIso?: string;
}): Promise<ServiceResult<SaasSubscriptionRecord>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = args.nowIso ?? new Date().toISOString();
  const periodStart = sub.currentPeriodStart ?? now;
  const periodEnd = sub.currentPeriodEnd ?? addPeriod(periodStart, sub.billingInterval);
  const existingAttempts = await listSaasAttempts(sub.id, 200);
  const attemptNo =
    existingAttempts.filter((a) => a.periodStart === periodStart && a.periodEnd === periodEnd)
      .length + 1;
  const { debtKeyFor } = await import("./collections");
  await recordSaasAttempt({
    id: uid("saas_att"),
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    periodStart,
    periodEnd,
    debtKey: debtKeyFor(sub.id, periodStart),
    amountMinor: sub.priceSnapshot.amountMinor,
    currency: sub.currency,
    status: "failed",
    kind: "charge",
    attemptNo,
    idempotencyKey: args.idempotencyKey,
    provider: args.provider ?? sub.provider,
    merchantAccount: args.merchantAccount ?? sub.merchantAccount,
    providerRef: args.providerRef ?? null,
    providerEventId: args.providerEventId,
    error: args.error,
    sentAt: null,
    retryable: args.retryable ?? null,
    createdAt: now,
  });
  if (!canTransition(sub.status, "past_due")) return ok(sub);
  const next: SaasSubscriptionRecord = {
    ...sub,
    status: "past_due",
    lastWebhookAt: now,
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  return ok(next);
}

/** Dönem sonunda iptal: ödenmiş süre sonuna kadar erişim sürer. */
export async function cancelAtPeriodEnd(
  tenantId: string,
  nowIso?: string
): Promise<ServiceResult<SaasSubscriptionRecord>> {
  const sub = await getSaasSubscription(tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = nowIso ?? new Date().toISOString();
  const next: SaasSubscriptionRecord = {
    ...sub,
    status: "canceled",
    canceledAt: now,
    cancelAtPeriodEnd: true,
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  return ok(next);
}

/** Yeniden etkinleştirme: ödeme doğrulanmadan hak açılmaz (pending'e döner). */
export async function reactivate(
  tenantId: string,
  nowIso?: string
): Promise<ServiceResult<SaasSubscriptionRecord>> {
  const sub = await getSaasSubscription(tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  if (sub.status !== "canceled" && sub.status !== "expired" && sub.status !== "suspended") {
    return fail("VALIDATION_ERROR", "Bu abonelik yeniden etkinleştirmeye uygun değil.");
  }
  const now = nowIso ?? new Date().toISOString();
  const next: SaasSubscriptionRecord = {
    ...sub,
    status: "pending",
    canceledAt: null,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  return ok(next);
}

/**
 * Upgrade: plan değişimi ÖDEME doğrulanmadan uygulanmaz. Bu fonksiyon yalnız
 * hedef planı doğrular ve "ödeme bekleniyor" kaydını döner; fiili geçiş
 * applyVerifiedPayment sonrası applyPlanChange ile yapılır.
 */
export function planUpgradeRequiresPayment(
  currentPlanKey: string,
  targetPlanKey: string,
  rank: Record<string, number>
): boolean {
  return (rank[targetPlanKey] ?? 0) > (rank[currentPlanKey] ?? 0);
}

/** Plan değişimi (ödeme doğrulandıktan sonra çağrılır). */
export async function applyPlanChange(args: {
  tenantId: string;
  targetPlanKey: string;
  priceSnapshot: SaasPriceSnapshot;
  effective: "immediate_paid" | "next_period";
  nowIso?: string;
}): Promise<ServiceResult<SaasSubscriptionRecord>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = args.nowIso ?? new Date().toISOString();
  if (args.effective === "next_period") {
    // V1: sonraki dönem planı snapshot notuna işlenir; dönem dönümünde uygulanır.
    const next: SaasSubscriptionRecord = {
      ...sub,
      priceSnapshot: {
        ...sub.priceSnapshot,
        campaignNote: `Sonraki dönem planı: ${args.targetPlanKey} (planlı düşürme/değişim).`,
      },
      updatedAt: now,
    };
    await upsertSaasSubscription(next);
    return ok(next);
  }
  const next: SaasSubscriptionRecord = {
    ...sub,
    planKey: args.targetPlanKey,
    priceSnapshot: args.priceSnapshot,
    catalogVersion: args.priceSnapshot.catalogVersion,
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  return ok(next);
}

/** İade/chargeback: AYRI kayıt, geçmiş charge satırı değişmez. */
export async function recordRefundOrChargeback(args: {
  tenantId: string;
  kind: "refund" | "chargeback";
  amountMinor: number;
  providerRef: string;
  providerEventId: string;
  idempotencyKey: string;
  note?: string;
  nowIso?: string;
}): Promise<ServiceResult<SaasCollectionAttemptRecord>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = args.nowIso ?? new Date().toISOString();
  const periodStart = sub.currentPeriodStart ?? now;
  const { debtKeyFor } = await import("./collections");
  const { record } = await recordSaasAttempt({
    id: uid("saas_att"),
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    periodStart,
    periodEnd: sub.currentPeriodEnd ?? now,
    debtKey: debtKeyFor(sub.id, periodStart),
    amountMinor: args.amountMinor,
    currency: sub.currency,
    status: "succeeded",
    kind: args.kind,
    attemptNo: 1,
    idempotencyKey: args.idempotencyKey,
    provider: sub.provider,
    merchantAccount: sub.merchantAccount,
    providerRef: args.providerRef,
    providerEventId: args.providerEventId,
    error: args.note ?? null,
    sentAt: now,
    retryable: null,
    createdAt: now,
  });
  return ok(record);
}

/** Başarısız denemeyi "voided" işaretle (geçmiş korunur, yeniden denenebilir). */
export async function voidAttempt(
  attemptId: string
): Promise<ServiceResult<SaasCollectionAttemptRecord>> {
  const updated = await updateSaasAttempt(attemptId, { status: "voided" });
  if (!updated) return fail("NOT_FOUND", "Tahsilat denemesi bulunamadı.");
  return ok(updated);
}
