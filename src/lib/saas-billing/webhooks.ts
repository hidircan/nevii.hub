/**
 * SaaS webhook/callback işleme + mutabakat (çok sağlayıcılı).
 *
 * Kurallar:
 * - İmzasız bildirim ASLA kabul edilmez (fail-closed).
 * - Event inbox + benzersiz olay kimliği: yinelenen teslimat aynı ödemeyi/
 *   hakkı iki kez üretmez.
 * - Sırası bozuk/geciken olay eski duruma geri döndürmez.
 * - Tarayıcıdan gelen fiyat/paket/tenant/"ödendi" bilgisine GÜVENİLMEZ.
 * - Sağlayıcı timeout'u / bildirim gecikmesi / kesinti tek başına
 *   "ödenmedi" kanıtı değildir.
 * - Her sağlayıcının bildirimi KENDİ adaptörüyle doğrulanır; eski işlemler
 *   global ayar değişiminden etkilenmez.
 * - Tutar/para birimi/merchant uyuşmazlığı fail-closed (uygulanmaz, görünür).
 */
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import type {
  SaasCurrency,
  SaasProviderId,
  SaasSubscriptionRecord,
  SaasWebhookEventRecord,
} from "./types";
import {
  findAttemptByProviderRef,
  getSaasSubscription,
  insertSaasWebhookEvent,
  listSaasAttempts,
  listSaasSubscriptions,
  updateSaasWebhookEvent,
  upsertSaasSubscription,
} from "./store";
import {
  addProviderLink,
  applyFailedPayment,
  canTransition,
} from "./subscriptions";
import { applyCollectionSuccess } from "./collections";
import {
  getIyzicoSubscriptionDetail,
  isIyzicoSubConfigured,
  verifyIyzicoSubWebhook,
} from "./iyzico-subscription";
import { getSaasProvider } from "./provider-adapter";
import { verifyPaytrCallback } from "./paytr-subscription";

export type WebhookProcessResult =
  | { outcome: "processed"; status: string }
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: string }
  | { outcome: "failed"; reason: string };

/** Sağlayıcıdan bağımsız normalize ödeme olayı. */
export type NormalizedPaymentEvent = {
  provider: SaasProviderId;
  merchantAccount: string;
  eventId: string;
  eventType: string;
  /** Ödeme sonucu: true=başarılı, false=kesin başarısız. */
  succeeded: boolean;
  amountMinor: number;
  currency: SaasCurrency;
  providerRef: string;
  eventTimeIso: string | null;
  payload: Record<string, unknown>;
  /** Kalıcılaştırılacak sağlayıcı referansları. */
  refs?: {
    customerRef?: string | null;
    subscriptionRef?: string | null;
    cardRef?: string | null;
    planRef?: string | null;
  };
};

/**
 * Olayın merchant hesabı: abonelik hâlâ bu sağlayıcıdaysa güncel kayıt,
 * geçiş yaptıysa o sağlayıcının KAYITLI bağlantısı (legacy callback).
 */
function merchantForEvent(
  sub: SaasSubscriptionRecord | null,
  provider: SaasProviderId
): string {
  if (sub && sub.provider !== provider) {
    const legacy = (sub.providerLinks ?? []).find((l) => l.provider === provider)?.merchant;
    if (legacy) return legacy;
  }
  return sub?.merchantAccount || getSaasProvider(provider).merchantAccount();
}

/** İmza doğrulaması BAŞARISIZ bildirim kaydı (görünürlük, etki yok). */
async function recordRejectedNotification(args: {
  provider: string;
  error: string;
  now: string;
}): Promise<void> {
  await insertSaasWebhookEvent({
    id: uid("saas_wh"),
    provider: args.provider,
    eventId: `invalid_${uid("evt")}`,
    eventType: "invalid_signature",
    tenantId: null,
    subscriptionId: null,
    payload: { note: "imza doğrulaması başarısız" },
    signatureValid: false,
    status: "failed",
    processedAt: args.now,
    error: args.error,
    createdAt: args.now,
  });
}

/**
 * Normalize olay uygulaması (sağlayıcı-bağımsız çekirdek).
 * resolveTenant: sağlayıcı referansından kurum bulur (sunucu kaydından).
 */
export async function applyNormalizedPaymentEvent(args: {
  event: NormalizedPaymentEvent;
  resolveTenant: (providerRef: string) => Promise<string | null>;
  nowIso?: string;
}): Promise<ServiceResult<WebhookProcessResult>> {
  const now = args.nowIso ?? new Date().toISOString();
  const e = args.event;

  const { record, duplicate } = await insertSaasWebhookEvent({
    id: uid("saas_wh"),
    provider: e.provider,
    eventId: e.eventId,
    eventType: e.eventType,
    tenantId: null,
    subscriptionId: null,
    payload: e.payload,
    signatureValid: true,
    status: "received",
    processedAt: null,
    error: null,
    createdAt: now,
  });
  if (duplicate) return ok({ outcome: "duplicate" });

  const failEvent = async (reason: string): Promise<ServiceResult<WebhookProcessResult>> => {
    await updateSaasWebhookEvent(record.id, { status: "failed", processedAt: now, error: reason });
    return ok({ outcome: "failed", reason });
  };

  // Tenant, ABONELİK referansından çözülür (sipariş ref'i ödemeyi tanımlar,
  // kurumu değil). refs yoksa providerRef'e düşülür (manuel kayıtlar).
  const tenantRef = e.refs?.subscriptionRef || e.providerRef;
  const tenantId = await args.resolveTenant(tenantRef);
  if (!tenantId) return failEvent("Sağlayıcı referansı tanınmıyor.");
  const sub = await getSaasSubscription(tenantId);
  if (!sub) return failEvent("Kurum aboneliği bulunamadı.");

  // Sağlayıcı uyuşmazlığı: bilinmeyen sağlayıcıdan gelen olay uygulanmaz.
  // İSTİSNA: aboneliğin o sağlayıcıyla kayıtlı bir bağlantısı (providerLinks)
  // varsa eski-geçerli callback işlenir (sağlayıcı geçişi sonrası geriye
  // dönük güvenlik: eski adaptör + eski merchant sırrı ile doğrulanır).
  if (sub.provider !== e.provider && sub.provider !== "mock" && e.provider !== "mock") {
    const legacy = (sub.providerLinks ?? []).some((l) => l.provider === e.provider);
    if (!legacy) {
      return failEvent(
        `Sağlayıcı uyuşmazlığı: abonelik ${sub.provider}, bildirim ${e.provider}.`
      );
    }
  }
  // Merchant uyuşmazlığı: yanlış hesap fail-closed. Geçiş sonrası eski
  // sağlayıcıdan gelen olayda beklenti, o sağlayıcının KAYITLI bağlantısıdır.
  const switched = sub.provider !== e.provider && sub.provider !== "mock" && e.provider !== "mock";
  const expectedMerchant = switched
    ? (sub.providerLinks ?? []).find((l) => l.provider === e.provider)?.merchant
    : sub.merchantAccount;
  if (expectedMerchant && e.merchantAccount && expectedMerchant !== e.merchantAccount) {
    return failEvent(
      `Merchant uyuşmazlığı: beklenen ${expectedMerchant}, gelen ${e.merchantAccount}.`
    );
  }

  // Sıra koruması: gecikmiş başarısızlık ileri durumu geri döndürmez.
  // (Başarılı olaylar idempotent uygulanır, kayıp tahsilat olmasın.)
  if (sub.lastWebhookAt && e.eventTimeIso && e.eventTimeIso < sub.lastWebhookAt && !e.succeeded) {
    await updateSaasWebhookEvent(record.id, {
      status: "ignored",
      processedAt: now,
      tenantId,
      subscriptionId: sub.id,
      error: "Gecikmiş olay: durum geri döndürülmedi.",
    });
    return ok({ outcome: "ignored", reason: "stale event" });
  }

  if (e.succeeded) {
    const applied = await applyCollectionSuccess({
      tenantId,
      amountMinor: e.amountMinor,
      currency: e.currency,
      provider: e.provider,
      merchantAccount: e.merchantAccount,
      providerRef: e.providerRef,
      providerEventId: e.eventId,
      idempotencyKey: `wh_${e.eventId}`,
      nowIso: now,
    });
    if (!applied.ok) return failEvent(applied.error.message);
    // Doğrulanmış tahsilat → sipariş snapshot + e-belge akışı. Duplicate
    // olayda yeniden belge AÇILMAZ (attempt tekilliği); hata ödeme kaydını
    // SİLMEZ, erişimi kapatmaz — belge kuyrukta görünür kalır.
    if (!applied.data.duplicate) {
      try {
        const { ensureInvoiceOrderForAttempt, requestDocument } = await import("./invoicing-orders");
        const att = await findAttemptByProviderRef(e.provider, e.providerRef);
        if (att && att.status === "succeeded") {
          const fresh = await getSaasSubscription(tenantId);
          if (fresh) {
            const ensured = await ensureInvoiceOrderForAttempt({
              attempt: att,
              subscriptionId: fresh.id,
              tenantId,
              priceSnapshot: fresh.priceSnapshot,
              planLabel: fresh.priceSnapshot.planLabel,
              nowIso: now,
            });
            if (ensured.ok && ensured.data.created) {
              await requestDocument(ensured.data.order.id, now);
            }
          }
        }
      } catch {
        // Belge hattı ödeme hattını DÜŞÜRMEZ; NeviiOS kuyruğunda görülür.
      }
    }
    await updateSaasWebhookEvent(record.id, {
      status: "processed",
      processedAt: now,
      tenantId,
      subscriptionId: sub.id,
    });
    // Sağlayıcı referanslarını kalıcılaştır + bağlantı izi.
    const fresh = await getSaasSubscription(tenantId);
    if (fresh && e.refs) {
      let next: SaasSubscriptionRecord = {
        ...fresh,
        providerCustomerRef: e.refs.customerRef ?? fresh.providerCustomerRef,
        providerSubscriptionRef: e.refs.subscriptionRef ?? fresh.providerSubscriptionRef,
        providerCardRef: e.refs.cardRef ?? fresh.providerCardRef,
        updatedAt: now,
      };
      next = addProviderLink(
        next,
        {
          provider: e.provider,
          merchant: e.merchantAccount,
          customerRef: e.refs.customerRef ?? null,
          subscriptionRef: e.refs.subscriptionRef ?? null,
          cardRef: e.refs.cardRef ?? null,
          planRef: e.refs.planRef ?? null,
        },
        now
      );
      await upsertSaasSubscription(next);
    }
    return ok({ outcome: applied.data.duplicate ? "duplicate" : "processed", status: "active" });
  }

  const failed = await applyFailedPayment({
    tenantId,
    error: `${e.provider} tahsilatı başarısız (ref ${e.providerRef}).`,
    providerEventId: e.eventId,
    idempotencyKey: `wh_${e.eventId}`,
    provider: e.provider,
    merchantAccount: e.merchantAccount,
    providerRef: e.providerRef,
    nowIso: now,
  });
  if (!failed.ok) return failEvent(failed.error.message);
  await updateSaasWebhookEvent(record.id, {
    status: "processed",
    processedAt: now,
    tenantId,
    subscriptionId: sub.id,
  });
  return ok({ outcome: "processed", status: failed.data.status });
}

/**
 * iyzico abonelik webhook'u. `resolveTenant` sağlayıcı referansından
 * kurumu bulur (tenant bilgisi istemciden DEĞİL, sunucu kaydından).
 */
export async function processIyzicoSubscriptionWebhook(args: {
  rawBody: string;
  signatureHeader: string | null;
  resolveTenant: (providerSubscriptionRef: string) => Promise<string | null>;
  nowIso?: string;
}): Promise<ServiceResult<WebhookProcessResult>> {
  const now = args.nowIso ?? new Date().toISOString();
  const verified = verifyIyzicoSubWebhook({
    rawBody: args.rawBody,
    signatureHeader: args.signatureHeader,
  });
  if (!verified.ok) {
    await recordRejectedNotification({ provider: "iyzico", error: verified.error, now });
    return fail("FORBIDDEN", verified.error);
  }
  const p = verified.payload;
  const eventId = `iyzico:${p.iyziReferenceCode || p.orderReferenceCode}`;
  const tenantId = await args.resolveTenant(p.subscriptionReferenceCode);
  const sub = tenantId ? await getSaasSubscription(tenantId) : null;
  return applyNormalizedPaymentEvent({
    event: {
      provider: "iyzico",
      merchantAccount: merchantForEvent(sub, "iyzico"),
      eventId,
      eventType: p.iyziEventType,
      succeeded: p.iyziEventType === "subscription.order.success",
      amountMinor: sub?.priceSnapshot.amountMinor ?? 0,
      currency: sub?.currency ?? "TRY",
      providerRef: p.orderReferenceCode,
      eventTimeIso: p.iyziEventTime > 0 ? new Date(p.iyziEventTime).toISOString() : null,
      payload: {
        orderReferenceCode: p.orderReferenceCode,
        customerReferenceCode: p.customerReferenceCode,
        subscriptionReferenceCode: p.subscriptionReferenceCode,
        iyziReferenceCode: p.iyziReferenceCode,
        iyziEventType: p.iyziEventType,
        iyziEventTime: p.iyziEventTime,
      },
      refs: {
        customerRef: p.customerReferenceCode,
        subscriptionRef: p.subscriptionReferenceCode,
      },
    },
    resolveTenant: args.resolveTenant,
    nowIso: now,
  });
}

/**
 * PayTR Bildirim URL callback'i. Doğrulama + normalize + uygulama.
 * merchant_oid → kayıtlı deneme üzerinden tenant çözülür.
 */
export async function processPaytrCallback(args: {
  form: Record<string, string>;
  nowIso?: string;
}): Promise<ServiceResult<WebhookProcessResult>> {
  const now = args.nowIso ?? new Date().toISOString();
  const verified = verifyPaytrCallback(args.form);
  if (!verified.ok) {
    await recordRejectedNotification({ provider: "paytr", error: verified.error, now });
    return fail("FORBIDDEN", verified.error);
  }
  const d = verified.data;
  const eventId = `paytr:${d.merchantOid}`;
  // Deneme kaydı üzerinden tenant + beklenen tutar çözülür.
  const attempt = await findAttemptByProviderRef("paytr", d.merchantOid);
  const sub = attempt ? await getSaasSubscription(attempt.tenantId) : null;
  // Beklenen = KDV dahil toplam (deneme kaydı, yoksa snapshot'taki toplam).
  const expectedMinor =
    attempt?.amountMinor ?? sub?.priceSnapshot.totalWithTaxMinor ?? sub?.priceSnapshot.amountMinor ?? 0;
  if (d.status === "success" && expectedMinor > 0 && d.totalAmountMinor !== expectedMinor) {
    // Tutar uyuşmazlığı: uygulaMA, görünür kıl.
    const { record } = await insertSaasWebhookEvent({
      id: uid("saas_wh"),
      provider: "paytr",
      eventId,
      eventType: "paytr.callback",
      tenantId: attempt?.tenantId ?? null,
      subscriptionId: sub?.id ?? null,
      payload: { merchantOid: d.merchantOid, status: d.status, totalAmountMinor: d.totalAmountMinor },
      signatureValid: true,
      status: "failed",
      processedAt: now,
      error: `Tutar uyuşmazlığı: beklenen ${expectedMinor}, gelen ${d.totalAmountMinor}.`,
      createdAt: now,
    });
    void record;
    return ok({ outcome: "failed", reason: "amount_mismatch" });
  }
  return applyNormalizedPaymentEvent({
    event: {
      provider: "paytr",
      merchantAccount: merchantForEvent(sub, "paytr"),
      eventId,
      eventType: "paytr.callback",
      succeeded: d.status === "success",
      amountMinor: expectedMinor,
      currency: sub?.currency ?? "TRY",
      providerRef: d.merchantOid,
      eventTimeIso: null,
      payload: {
        merchantOid: d.merchantOid,
        status: d.status,
        totalAmountMinor: d.totalAmountMinor,
        currency: d.currency,
        paymentType: d.paymentType,
        testMode: d.testMode,
      },
      refs: {
        customerRef: d.utoken,
        cardRef: d.ctoken,
      },
    },
    resolveTenant: async (ref) => {
      const a = await findAttemptByProviderRef("paytr", ref);
      return a?.tenantId ?? null;
    },
    nowIso: now,
  });
}

/** Başarısız iş görünürlüğü: failed durumundaki inbox kayıtları. */
export async function listFailedWebhookEvents(
  limit = 50
): Promise<SaasWebhookEventRecord[]> {
  const { listSaasWebhookEvents } = await import("./store");
  const all = await listSaasWebhookEvents(200);
  return all.filter((e) => e.status === "failed").slice(0, Math.min(Math.max(limit, 1), 200));
}

/**
 * Periyodik mutabakat (ölçülü: varsayılan küçük parti, sık cron YOK).
 * - iyzico abonelikleri: server-to-server detay ile durum karşılaştırma.
 * - PayTR: abonelik nesnesi yok; açık (uncertain/pending) denemeler durum
 *   sorgusuyla uzlaştırılır.
 */
export async function reconcileSubscriptions(args?: {
  limit?: number;
  nowIso?: string;
}): Promise<
  ServiceResult<{
    checked: number;
    corrected: number;
    skipped: string[];
  }>
> {
  const now = args?.nowIso ?? new Date().toISOString();
  const subs = await listSaasSubscriptions(args?.limit ?? 25);
  let checked = 0;
  let corrected = 0;
  const skipped: string[] = [];
  const { resolveUncertainAttempt } = await import("./collections");
  for (const sub of subs) {
    if (sub.status === "trialing" || sub.status === "pending") {
      skipped.push(`${sub.tenantId}: deneme/bekleyen`);
      continue;
    }
    if (sub.provider === "paytr") {
      const provider = getSaasProvider("paytr");
      if (!provider.isConfigured()) {
        skipped.push(`${sub.tenantId}: paytr yapılandırılmadı`);
        continue;
      }
      const attempts = await listSaasAttempts(sub.id, 50);
      const open = attempts.filter(
        (a) => a.kind === "charge" && (a.status === "uncertain" || a.status === "pending") && a.providerRef
      );
      if (open.length === 0) {
        await upsertSaasSubscription({ ...sub, lastReconciledAt: now, updatedAt: now });
        checked += 1;
        continue;
      }
      for (const a of open.slice(0, 5)) {
        const q = await provider.queryChargeStatus(a.providerRef!);
        if (!q.ok || !q.found) continue;
        checked += 1;
        if (q.status === "success") {
          const r = await resolveUncertainAttempt({ attemptId: a.id, succeeded: true });
          if (r.ok) {
            await upsertSaasSubscription({
              ...sub,
              status: "active",
              currentPeriodStart: a.periodStart,
              currentPeriodEnd: a.periodEnd,
              paidThrough: a.periodEnd,
              lastReconciledAt: now,
              updatedAt: now,
            });
            corrected += 1;
          }
        } else if (q.status === "failed") {
          await resolveUncertainAttempt({ attemptId: a.id, succeeded: false, error: "Mutabakat: sağlayıcıda başarısız." });
          corrected += 1;
        }
      }
      await upsertSaasSubscription({ ...sub, lastReconciledAt: now, updatedAt: now });
      continue;
    }
    if (sub.provider !== "iyzico" && sub.provider !== "mock") {
      skipped.push(`${sub.tenantId}: ${sub.provider} için uzlaştırma yok`);
      continue;
    }
    if (!isIyzicoSubConfigured() && sub.provider === "iyzico") {
      skipped.push(`${sub.tenantId}: iyzico yapılandırılmadı`);
      continue;
    }
    if (!sub.providerSubscriptionRef) {
      skipped.push(`${sub.tenantId}: provider referansı yok`);
      continue;
    }
    if (sub.provider === "mock") {
      skipped.push(`${sub.tenantId}: mock (uzlaştırma yok)`);
      continue;
    }
    checked += 1;
    const detail = await getIyzicoSubscriptionDetail(sub.providerSubscriptionRef);
    if (!detail.ok) {
      skipped.push(`${sub.tenantId}: sağlayıcıya ulaşılamadı (${detail.errorCode})`);
      continue;
    }
    const item = detail.data.data.items[0];
    if (!item) {
      skipped.push(`${sub.tenantId}: sağlayıcıda abonelik bulunamadı`);
      continue;
    }
    const { mapProviderStatus } = await import("./subscriptions");
    const mapped = mapProviderStatus("iyzico", item.subscriptionStatus);
    if (!mapped) {
      skipped.push(`${sub.tenantId}: bilinmeyen sağlayıcı durumu`);
      continue;
    }
    if (mapped !== sub.status && canTransition(sub.status, mapped)) {
      await upsertSaasSubscription({
        ...sub,
        status: mapped,
        lastReconciledAt: now,
        updatedAt: now,
      });
      corrected += 1;
    } else {
      await upsertSaasSubscription({ ...sub, lastReconciledAt: now, updatedAt: now });
    }
  }
  return ok({ checked, corrected, skipped });
}

/** Mock webhook olayı (local/test) — imzalı akışı atlamaz, ayrı test yoludur. */
export async function recordMockWebhookForTests(args: {
  tenantId: string;
  subscriptionId: string;
  eventType: string;
  nowIso?: string;
}): Promise<SaasWebhookEventRecord> {
  const now = args.nowIso ?? new Date().toISOString();
  const { record } = await insertSaasWebhookEvent({
    id: uid("saas_wh"),
    provider: "mock",
    eventId: `mock_${uid("evt")}`,
    eventType: args.eventType,
    tenantId: args.tenantId,
    subscriptionId: args.subscriptionId,
    payload: { mock: true },
    signatureValid: true,
    status: "processed",
    processedAt: now,
    error: null,
    createdAt: now,
  });
  return record;
}

export async function findSubscriptionByProviderRef(
  providerSubscriptionRef: string,
  limit = 200
): Promise<string | null> {
  const subs = await listSaasSubscriptions(limit);
  return (
    subs.find((s) => s.providerSubscriptionRef === providerSubscriptionRef)?.tenantId ?? null
  );
}
