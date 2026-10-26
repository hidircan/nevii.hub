/**
 * NeviiOS faturalandırma özeti — API route ve platform sayfası ortak kullanır.
 * Sınırlı listeler (tam tablo okuma yok).
 */
import { resolveSetting } from "../platform/resolve";
import {
  listSaasSubscriptions,
  listSaasTrialRequests,
  listSaasWebhookEvents,
} from "./store";
import { listFailedWebhookEvents } from "./webhooks";

export async function getBillingOverview() {
  const [subs, webhooks, failed, trialRequests] = await Promise.all([
    listSaasSubscriptions(100),
    listSaasWebhookEvents(20),
    listFailedWebhookEvents(20),
    listSaasTrialRequests(50),
  ]);
  const rows = [];
  for (const s of subs) {
    const [enf, exc] = await Promise.all([
      resolveSetting({ tenantId: s.tenantId }, "billing.enforcement").catch(() => null),
      resolveSetting({ tenantId: s.tenantId }, "billing.exception").catch(() => null),
    ]);
    rows.push({
      tenantId: s.tenantId,
      planKey: s.planKey,
      status: s.status,
      billingInterval: s.billingInterval,
      amountMinor: s.priceSnapshot.amountMinor,
      sandbox: s.priceSnapshot.sandbox,
      trialEndsAt: s.trialEndsAt,
      currentPeriodEnd: s.currentPeriodEnd,
      paidThrough: s.paidThrough,
      canceledAt: s.canceledAt,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      provider: s.provider,
      providerSubscriptionRef: s.providerSubscriptionRef,
      lastWebhookAt: s.lastWebhookAt,
      lastReconciledAt: s.lastReconciledAt,
      enforcement: enf?.effectiveValue === true,
      exception: exc?.effectiveValue ?? null,
      updatedAt: s.updatedAt,
    });
  }
  return {
    subscriptions: rows,
    lastWebhooks: webhooks.map((w) => ({
      id: w.id,
      provider: w.provider,
      eventId: w.eventId,
      eventType: w.eventType,
      tenantId: w.tenantId,
      status: w.status,
      error: w.error,
      createdAt: w.createdAt,
    })),
    failedWebhooks: failed.map((w) => ({
      id: w.id,
      eventId: w.eventId,
      eventType: w.eventType,
      error: w.error,
      createdAt: w.createdAt,
    })),
    trialRequests: trialRequests.map((r) => ({
      id: r.id,
      institutionName: r.institutionName,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      ownerPhone: r.ownerPhone,
      status: r.status,
      tenantId: r.tenantId,
      createdAt: r.createdAt,
    })),
  };
}
