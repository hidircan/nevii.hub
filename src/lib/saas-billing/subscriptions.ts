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
 * Sağlayıcı durum eşlemesi (iyzico Abonelik → yerel). Bilinmeyen değer
 * fail-closed: eşleşme yoksa durum değişmez, olay "ignored" işaretlenir.
 */
export function mapProviderStatus(providerStatus: string): SaasSubscriptionStatus | null {
  const v = providerStatus.trim().toLowerCase();
  switch (v) {
    case "pending":
    case "incomplete":
    case "initialized":
      return "pending";
    case "trialing":
    case "trial":
      return "trialing";
    case "active":
    case "subscribed":
    case "upgraded":
      return "active";
    case "past_due":
    case "pastdue":
    case "payment_failed":
      return "past_due";
    case "suspended":
    case "unpaid":
      return "suspended";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "expired":
      return "expired";
    default:
      return null;
  }
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

/** Dönem uzunluğu — sunucu takvimi (ay/yıl ekleme, UTC). */
export function addPeriod(fromIso: string, interval: SaasBillingInterval): string {
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) throw new Error("Geçersiz dönem tarihi.");
  const next = new Date(d);
  if (interval === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

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
  provider?: string;
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
    provider: args.provider ?? "iyzico",
    providerCustomerRef: null,
    providerSubscriptionRef: null,
    lastWebhookAt: null,
    lastReconciledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Doğrulanmış ödeme sonrası dönem ilerletme. Tek dönem/tek başarılı tahsilat:
 * aynı dönem için ikinci "succeeded" yazılmaz (idempotencyKey + durum kontrolü).
 */
export async function applyVerifiedPayment(args: {
  tenantId: string;
  amountMinor: number;
  providerRef: string;
  providerEventId: string;
  idempotencyKey: string;
  nowIso?: string;
}): Promise<ServiceResult<{ subscription: SaasSubscriptionRecord; duplicate: boolean }>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = args.nowIso ?? new Date().toISOString();

  // Dönem: mevcut dönem sonu gelecekteyse uzat, yoksa şimdi başlat.
  const periodStart =
    sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > new Date(now).getTime()
      ? sub.currentPeriodEnd
      : now;
  const periodEnd = addPeriod(periodStart, sub.billingInterval);

  const existingAttempts = await listSaasAttempts(sub.id, 200);
  // Aynı sağlayıcı siparişi (order ref) daha önce başarıldıysa çift teslimattır
  // (ör. retry sonrası aynı order ref ile yeni event) → tek etki.
  const sameOrderSucceeded = existingAttempts.some(
    (a) => a.kind === "charge" && a.status === "succeeded" && a.providerRef === args.providerRef
  );
  if (sameOrderSucceeded) {
    return ok({ subscription: sub, duplicate: true });
  }
  const alreadySucceeded = existingAttempts.some(
    (a) =>
      a.kind === "charge" &&
      a.status === "succeeded" &&
      a.periodStart === periodStart &&
      a.periodEnd === periodEnd
  );
  if (alreadySucceeded) {
    return ok({ subscription: sub, duplicate: true });
  }

  const attemptNo =
    existingAttempts.filter((a) => a.periodStart === periodStart && a.periodEnd === periodEnd)
      .length + 1;
  const attempt: SaasCollectionAttemptRecord = {
    id: uid("saas_att"),
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    periodStart,
    periodEnd,
    amountMinor: args.amountMinor,
    currency: "TRY",
    status: "succeeded",
    kind: "charge",
    attemptNo,
    idempotencyKey: args.idempotencyKey,
    providerRef: args.providerRef,
    providerEventId: args.providerEventId,
    error: null,
    createdAt: now,
  };
  const { duplicate } = await recordSaasAttempt(attempt);
  if (duplicate) return ok({ subscription: sub, duplicate: true });

  const next: SaasSubscriptionRecord = {
    ...sub,
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    paidThrough: periodEnd,
    cancelAtPeriodEnd: false,
    lastWebhookAt: now,
    updatedAt: now,
  };
  await upsertSaasSubscription(next);
  return ok({ subscription: next, duplicate: false });
}

/** Başarısız ödeme kaydı → past_due (tek başına erişim kesmez; enforcement karar verir). */
export async function applyFailedPayment(args: {
  tenantId: string;
  error: string;
  providerEventId: string;
  idempotencyKey: string;
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
  await recordSaasAttempt({
    id: uid("saas_att"),
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    periodStart,
    periodEnd,
    amountMinor: sub.priceSnapshot.amountMinor,
    currency: "TRY",
    status: "failed",
    kind: "charge",
    attemptNo,
    idempotencyKey: args.idempotencyKey,
    providerRef: null,
    providerEventId: args.providerEventId,
    error: args.error,
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
  const { record } = await recordSaasAttempt({
    id: uid("saas_att"),
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    periodStart: sub.currentPeriodStart ?? now,
    periodEnd: sub.currentPeriodEnd ?? now,
    amountMinor: args.amountMinor,
    currency: "TRY",
    status: "succeeded",
    kind: args.kind,
    attemptNo: 1,
    idempotencyKey: args.idempotencyKey,
    providerRef: args.providerRef,
    providerEventId: args.providerEventId,
    error: args.note ?? null,
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
