/**
 * SaaS webhook işleme + mutabakat.
 *
 * Kurallar:
 * - İmzasız webhook ASLA kabul edilmez (fail-closed).
 * - Event inbox + benzersiz olay kimliği: yinelenen teslimat aynı ödemeyi/
 *   hakkı iki kez üretmez.
 * - Sırası bozuk/geciken olay eski duruma geri döndürmez (canTransition +
 *   olay zamanı karşılaştırması).
 * - Tarayıcıdan gelen fiyat/paket/tenant/"ödendi" bilgisine GÜVENİLMEZ.
 * - Sağlayıcı timeout'u / webhook gecikmesi / kesinti tek başına
 *   "ödenmedi" kanıtı değildir.
 * - Yenilemeyi sağlayıcı zamanlar → uygulama ikinci çekim YAPMAZ; yalnız
 *   izler ve mutabakatla doğrular.
 */
import { uid } from "../utils";
import { fail, ok, type ServiceResult } from "../services/result";
import type { SaasWebhookEventRecord } from "./types";
import {
  getSaasSubscription,
  insertSaasWebhookEvent,
  listSaasSubscriptions,
  updateSaasWebhookEvent,
  upsertSaasSubscription,
} from "./store";
import {
  applyFailedPayment,
  applyVerifiedPayment,
  canTransition,
  mapProviderStatus,
} from "./subscriptions";
import {
  getIyzicoSubscriptionDetail,
  isIyzicoSubConfigured,
  verifyIyzicoSubWebhook,
} from "./iyzico-subscription";

export type WebhookProcessResult =
  | { outcome: "processed"; status: string }
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: string }
  | { outcome: "failed"; reason: string };

/**
 * iyzico abonelik webhook'unu işler. `resolveTenant` sağlayıcı referansından
 * kurum aboneliğini bulur (tenant bilgisi istemciden DEĞİL, sunucu kaydından).
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
    // İmzasız/sahte: inbox'a "failed" kaydı (görünürlük için), etki YOK.
    await insertSaasWebhookEvent({
      id: uid("saas_wh"),
      provider: "iyzico",
      eventId: `invalid_${uid("evt")}`,
      eventType: "invalid_signature",
      tenantId: null,
      subscriptionId: null,
      payload: { note: "imza doğrulaması başarısız" },
      signatureValid: false,
      status: "failed",
      processedAt: now,
      error: verified.error,
      createdAt: now,
    });
    return fail("FORBIDDEN", verified.error);
  }

  const p = verified.payload;
  // Benzersiz olay kimliği: sağlayıcı referans kodu (tekrar teslimatlar aynı).
  const eventId = `iyzico:${p.iyziReferenceCode || p.orderReferenceCode}`;
  const { record, duplicate } = await insertSaasWebhookEvent({
    id: uid("saas_wh"),
    provider: "iyzico",
    eventId,
    eventType: p.iyziEventType,
    tenantId: null,
    subscriptionId: null,
    payload: {
      orderReferenceCode: p.orderReferenceCode,
      customerReferenceCode: p.customerReferenceCode,
      subscriptionReferenceCode: p.subscriptionReferenceCode,
      iyziReferenceCode: p.iyziReferenceCode,
      iyziEventType: p.iyziEventType,
      iyziEventTime: p.iyziEventTime,
    },
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

  const tenantId = await args.resolveTenant(p.subscriptionReferenceCode);
  if (!tenantId) {
    return failEvent("Abonelik referansı tanınmıyor (bilinmeyen subscriptionReferenceCode).");
  }
  const sub = await getSaasSubscription(tenantId);
  if (!sub) return failEvent("Kurum aboneliği bulunamadı.");

  // Sıra koruması: olay zamanı, son işlenen webhoaktan eskiyse ve durum
  // ilerideyse geri döndürme (gecikmiş teslimat).
  const eventTime = p.iyziEventTime > 0 ? new Date(p.iyziEventTime).toISOString() : now;
  if (sub.lastWebhookAt && eventTime < sub.lastWebhookAt) {
    // Başarılı ödeme olayları yine de idempotent uygulanır (kayıp tahsilat
    // olmasın), ancak durum geri döndürülmez.
    if (p.iyziEventType !== "subscription.order.success") {
      await updateSaasWebhookEvent(record.id, {
        status: "ignored",
        processedAt: now,
        tenantId,
        subscriptionId: sub.id,
        error: "Gecikmiş olay: durum geri döndürülmedi.",
      });
      return ok({ outcome: "ignored", reason: "stale event" });
    }
  }

  if (p.iyziEventType === "subscription.order.success") {
    const applied = await applyVerifiedPayment({
      tenantId,
      amountMinor: sub.priceSnapshot.amountMinor,
      providerRef: p.orderReferenceCode,
      providerEventId: eventId,
      idempotencyKey: `wh_${eventId}`,
      nowIso: now,
    });
    if (!applied.ok) return failEvent(applied.error.message);
    await updateSaasWebhookEvent(record.id, {
      status: "processed",
      processedAt: now,
      tenantId,
      subscriptionId: sub.id,
    });
    // Sağlayıcı referanslarını kalıcılaştır.
    const fresh = await getSaasSubscription(tenantId);
    if (fresh) {
      await upsertSaasSubscription({
        ...fresh,
        providerCustomerRef: p.customerReferenceCode,
        providerSubscriptionRef: p.subscriptionReferenceCode,
        updatedAt: now,
      });
    }
    return ok({ outcome: applied.data.duplicate ? "duplicate" : "processed", status: "active" });
  }

  // subscription.order.failure → başarısız deneme + past_due (erişim kararı enforcement'ta).
  const failed = await applyFailedPayment({
    tenantId,
    error: `iyzico yinelenen tahsilat başarısız (order ${p.orderReferenceCode}).`,
    providerEventId: eventId,
    idempotencyKey: `wh_${eventId}`,
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

/** Başarısız iş görünürlüğü: failed durumundaki inbox kayıtları. */
export async function listFailedWebhookEvents(
  limit = 50
): Promise<SaasWebhookEventRecord[]> {
  const { listSaasWebhookEvents } = await import("./store");
  const all = await listSaasWebhookEvents(200);
  return all.filter((e) => e.status === "failed").slice(0, Math.min(Math.max(limit, 1), 200));
}

/**
 * Periyodik sağlayıcı mutabakatı (ölçülü: varsayılan küçük parti, sık cron
 * YOK). Her abonelik için server-to-server detay çeker, yerelle
 * karşılaştırır; fark varsa durumu SADECE ileri yönde düzeltir ve
 * lastReconciledAt'i işaretler.
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
  if (!isIyzicoSubConfigured()) {
    return fail("FORBIDDEN", "Sağlayıcı yapılandırılmadı; mutabakat yapılmadı.");
  }
  const subs = await listSaasSubscriptions(args?.limit ?? 25);
  let checked = 0;
  let corrected = 0;
  const skipped: string[] = [];
  for (const sub of subs) {
    if (!sub.providerSubscriptionRef) {
      skipped.push(`${sub.tenantId}: provider referansı yok`);
      continue;
    }
    if (sub.status === "trialing" || sub.status === "pending") {
      skipped.push(`${sub.tenantId}: deneme/bekleyen (sağlayıcıda yok)`);
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
    const mapped = mapProviderStatus(item.subscriptionStatus);
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
