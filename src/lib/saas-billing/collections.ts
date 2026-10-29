/**
 * Sağlayıcı-bağımsız tahsilat çekirdeği (H).
 *
 * Ödeme SONRASI erişim güncellemesi (dönem uzatma + paid-through + active)
 * TEK BURADA yapılır; webhook işlemcileri, scheduler job ve manuel onay
 * hepsi bu servisi çağırır. Sağlayıcıya özgü hiçbir ad içermez.
 *
 * Çifte tahsilat koruması (dört katman):
 * 1. Dış çağrı ÖNCESİ atomik claim: borç başına tek açık (pending/uncertain)
 *    deneme — DB'de `FOR UPDATE` + kısmi unique index, json'da kilitli yazım.
 *    İkinci worker P2002/busy ile düşer, sağlayıcıya İKİNCİ istek gitmez.
 * 2. idempotencyKey unique (deneme başına).
 * 3. Dönem başına tek "succeeded" charge: DB'de kısmi unique index,
 *    json'da kilitli yazım içi kontrol.
 * 4. Aynı sağlayıcı sipariş ref'i ikinci kez başarılandırılmaz.
 */
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import type {
  SaasBillingInterval,
  SaasCollectionAttemptRecord,
  SaasCurrency,
  SaasProviderId,
  SaasSubscriptionRecord,
} from "./types";
import {
  getSaasSubscription,
  listSaasAttempts,
  recordSaasAttempt,
  updateSaasAttempt,
  upsertSaasSubscription,
} from "./store";

/** Borç kimliği: dönem borcu, deneme kimliğinden ayrıdır. */
export function debtKeyFor(subscriptionId: string, periodStart: string): string {
  return `${subscriptionId}:${periodStart}`;
}

// ───────────── Süreç-içi dönem kilidi (json/memory) ─────────────

const periodLocks = new Map<string, Promise<unknown>>();

/** Aynı borç için kritik bölümü serileştirir (DB'de kısmi index de korur). */
export async function withDebtLock<T>(debtKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = periodLocks.get(debtKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  periodLocks.set(
    debtKey,
    prev.then(() => gate)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (periodLocks.get(debtKey)?.then) {
      // Kuyruk boşaldıysa temizle (basit sayaç yerine söz zinciri).
    }
  }
}

export type CollectionSuccessInput = {
  tenantId: string;
  amountMinor: number;
  currency: SaasCurrency;
  provider: SaasProviderId;
  merchantAccount: string;
  providerRef: string;
  providerEventId: string;
  idempotencyKey: string;
  /** Belirtilmezse dönem abonelikten türetilir. */
  periodStart?: string;
  periodEnd?: string;
  nowIso?: string;
};

function periodEndFor(
  periodStart: string,
  interval: SaasBillingInterval,
  timeZone: string
): string {
  // Tz-aware dönem hesabı (subscriptions.ts ile aynı matematik).
  return periodEndInTz(periodStart, interval, timeZone);
}

import { addPeriodInTz } from "./periods";

function periodEndInTz(start: string, interval: SaasBillingInterval, tz: string): string {
  return addPeriodInTz(start, interval, tz || "UTC");
}

/**
 * Doğrulanmış tahsilatı uygular: deneme kaydı + dönem uzatma + active.
 * Tutar/para birimi snapshot ile eşleşmek zorunda (yanlış tutar/para
 * birimi fail-closed).
 */
export async function applyCollectionSuccess(
  args: CollectionSuccessInput
): Promise<ServiceResult<{ subscription: SaasSubscriptionRecord; duplicate: boolean }>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = args.nowIso ?? new Date().toISOString();

  if (args.currency !== sub.currency) {
    return fail(
      "VALIDATION_ERROR",
      `Para birimi uyuşmazlığı: beklenen ${sub.currency}, gelen ${args.currency}.`
    );
  }
  // KDV dahil toplam snapshot'taki toplamla eşleşmeli (eski kayıtlarda
  // toplam yoksa KDV hariç tutar — geriye uyumluluk).
  const expectedTotal = sub.priceSnapshot.totalWithTaxMinor ?? sub.priceSnapshot.amountMinor;
  if (args.amountMinor !== expectedTotal) {
    return fail(
      "VALIDATION_ERROR",
      `Tutar uyuşmazlığı: beklenen ${expectedTotal}, gelen ${args.amountMinor}.`
    );
  }

  const tz = sub.billingTimeZone || "UTC";
  const periodStart =
    args.periodStart ??
    (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > new Date(now).getTime()
      ? sub.currentPeriodEnd
      : now);
  const periodEnd = args.periodEnd ?? periodEndFor(periodStart, sub.billingInterval, tz);
  const debtKey = debtKeyFor(sub.id, periodStart);

  return withDebtLock(debtKey, async () => {
    const existingAttempts = await listSaasAttempts(sub.id, 200);
    const sameOrderSucceeded = existingAttempts.some(
      (a) => a.kind === "charge" && a.status === "succeeded" && a.providerRef === args.providerRef
    );
    if (sameOrderSucceeded) return ok({ subscription: sub, duplicate: true });
    const alreadySucceeded = existingAttempts.some(
      (a) =>
        a.kind === "charge" &&
        a.status === "succeeded" &&
        a.periodStart === periodStart &&
        a.periodEnd === periodEnd
    );
    if (alreadySucceeded) return ok({ subscription: sub, duplicate: true });

    // Aynı siparişin açık claim'i varsa (job çekti, callback doğruladı)
    // YENİ satır yerine claim tamamlanır — bayat pending satır kalmaz.
    // Uzatma, claim'in BORÇ döneminden yapılır (varış anından değil).
    // İlk-ödeme yer tutucuları (başlangıç=bitiş) hariç — onlar hesaplanır.
    const openClaim = existingAttempts.find(
      (a) =>
        a.kind === "charge" &&
        (a.status === "pending" || a.status === "uncertain") &&
        a.provider === args.provider &&
        a.providerRef === args.providerRef
    );
    if (openClaim) {
      await updateSaasAttempt(openClaim.id, {
        status: "succeeded",
        providerEventId: args.providerEventId,
        error: null,
      });
      const useClaimPeriod = openClaim.periodEnd > openClaim.periodStart;
      const next = await extendSubscriptionForPaidPeriod(
        sub,
        useClaimPeriod ? openClaim.periodStart : periodStart,
        useClaimPeriod ? openClaim.periodEnd : periodEnd,
        now
      );
      return ok({ subscription: next, duplicate: false });
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
      debtKey,
      amountMinor: args.amountMinor,
      currency: args.currency,
      status: "succeeded",
      kind: "charge",
      attemptNo,
      idempotencyKey: args.idempotencyKey,
      provider: args.provider,
      merchantAccount: args.merchantAccount,
      providerRef: args.providerRef,
      providerEventId: args.providerEventId,
      error: null,
      sentAt: now,
      retryable: null,
      createdAt: now,
    };
    try {
      const { duplicate } = await recordSaasAttempt(attempt);
      if (duplicate) return ok({ subscription: sub, duplicate: true });
    } catch (e) {
      // Kısmi unique ihlali (P2002) → dönem zaten başarıldı, tek etki.
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
        return ok({ subscription: sub, duplicate: true });
      }
      throw e;
    }

    const next = await extendSubscriptionForPaidPeriod(sub, periodStart, periodEnd, now);
    return ok({ subscription: next, duplicate: false });
  });
}

/**
 * Ödenmiş dönem uzatması — TEK uygulama noktası (webhook, scheduler,
 * uzlaştırma, manuel onay hepsi buradan geçer).
 */
export async function extendSubscriptionForPaidPeriod(
  sub: SaasSubscriptionRecord,
  periodStart: string,
  periodEnd: string,
  nowIso: string
): Promise<SaasSubscriptionRecord> {
  const next: SaasSubscriptionRecord = {
    ...sub,
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    paidThrough: periodEnd,
    cancelAtPeriodEnd: false,
    lastWebhookAt: nowIso,
    updatedAt: nowIso,
  };
  await upsertSaasSubscription(next);
  return next;
}

/** past_due geçişi — deneme satırı YAZMAZ (claim finalize eden çağırır). */
export async function transitionSubscriptionPastDue(
  tenantId: string,
  nowIso: string
): Promise<SaasSubscriptionRecord | null> {
  const sub = await getSaasSubscription(tenantId);
  if (!sub) return null;
  const { canTransition } = await import("./subscriptions");
  if (!canTransition(sub.status, "past_due")) return sub;
  const next: SaasSubscriptionRecord = {
    ...sub,
    status: "past_due",
    lastWebhookAt: nowIso,
    updatedAt: nowIso,
  };
  await upsertSaasSubscription(next);
  return next;
}

/** Başarısız deneme kaydı (kesinleşmiş sonuçlar için). */
export async function applyCollectionFailure(args: {
  tenantId: string;
  error: string;
  providerEventId: string;
  idempotencyKey: string;
  provider: SaasProviderId;
  merchantAccount: string;
  providerRef?: string | null;
  /** false = kart güncellenmeden otomatik retry yok. */
  retryable?: boolean | null;
  nowIso?: string;
}): Promise<ServiceResult<SaasSubscriptionRecord>> {
  const { applyFailedPayment } = await import("./subscriptions");
  return applyFailedPayment({
    tenantId: args.tenantId,
    error: args.error,
    providerEventId: args.providerEventId,
    idempotencyKey: args.idempotencyKey,
    provider: args.provider,
    merchantAccount: args.merchantAccount,
    providerRef: args.providerRef ?? null,
    retryable: args.retryable ?? null,
    nowIso: args.nowIso,
  });
}

/** Belirsiz (timeout/bilinmeyen) deneme kaydı — uzlaştırma öncesi retry YOK. */
export async function applyCollectionUncertain(args: {
  tenantId: string;
  error: string;
  providerEventId: string | null;
  idempotencyKey: string;
  provider: SaasProviderId;
  merchantAccount: string;
  providerRef: string | null;
  nowIso?: string;
}): Promise<ServiceResult<SaasCollectionAttemptRecord>> {
  const sub = await getSaasSubscription(args.tenantId);
  if (!sub) return fail("NOT_FOUND", "Abonelik bulunamadı.");
  const now = args.nowIso ?? new Date().toISOString();
  const periodStart =
    sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > new Date(now).getTime()
      ? sub.currentPeriodEnd
      : now;
  const periodEnd = periodEndFor(periodStart, sub.billingInterval, sub.billingTimeZone || "UTC");
  const existingAttempts = await listSaasAttempts(sub.id, 200);
  const attemptNo =
    existingAttempts.filter((a) => a.periodStart === periodStart && a.periodEnd === periodEnd)
      .length + 1;
  const { record } = await recordSaasAttempt({
    id: uid("saas_att"),
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    periodStart,
    periodEnd,
    debtKey: debtKeyFor(sub.id, periodStart),
    amountMinor: sub.priceSnapshot.amountMinor,
    currency: sub.currency,
    status: "uncertain",
    kind: "charge",
    attemptNo,
    idempotencyKey: args.idempotencyKey,
    provider: args.provider,
    merchantAccount: args.merchantAccount,
    providerRef: args.providerRef,
    providerEventId: args.providerEventId,
    error: args.error,
    sentAt: null,
    retryable: null,
    createdAt: now,
  });
  return ok(record);
}

/** Belirsiz denemeyi kesin sonuca çevirir (uzlaştırma sonrası). */
export async function resolveUncertainAttempt(args: {
  attemptId: string;
  succeeded: boolean;
  providerEventId?: string;
  error?: string;
}): Promise<ServiceResult<SaasCollectionAttemptRecord>> {
  const { getSaasAttemptById } = await import("./store");
  const current = await getSaasAttemptById(args.attemptId);
  if (!current) return fail("NOT_FOUND", "Tahsilat denemesi bulunamadı.");
  if (args.succeeded) {
    // Dönem tek-success koruması (DB'de kısmi unique de korur).
    const attempts = await listSaasAttempts(current.subscriptionId, 200);
    const clash = attempts.some(
      (a) =>
        a.id !== current.id &&
        a.kind === "charge" &&
        a.status === "succeeded" &&
        a.periodStart === current.periodStart &&
        a.periodEnd === current.periodEnd
    );
    if (clash) return fail("CONFLICT", "Bu dönem için zaten başarılı tahsilat var.");
  }
  try {
    const updated = await updateSaasAttempt(args.attemptId, {
      status: args.succeeded ? "succeeded" : "failed",
      ...(args.providerEventId !== undefined ? { providerEventId: args.providerEventId } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
    });
    if (!updated) return fail("NOT_FOUND", "Tahsilat denemesi bulunamadı.");
    return ok(updated);
  } catch (e) {
    // Yarışta dönem-success kısmi indexi (P2002) → çakışma, ikinci etki yok.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return fail("CONFLICT", "Bu dönem için zaten başarılı tahsilat var.");
    }
    throw e;
  }
}
