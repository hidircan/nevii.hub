/**
 * NeviiOS faturalandırma özeti — API route ve platform sayfası ortak kullanır.
 * Sınırlı listeler (tam tablo okuma yok).
 */
import { resolveSetting } from "../platform/resolve";
import { listPlatformTenants } from "../platform/store";
import { getPublishedCatalog } from "../platform/commercial-catalog";
import { planLabel } from "../platform/entitlements";
import {
  listSaasPendingOrders,
  listSaasPurchaseRequests,
  listSaasQuoteRequests,
  listSaasSubscriptions,
  listSaasTrialRequests,
  listSaasWebhookEvents,
} from "./store";
import { listFailedWebhookEvents } from "./webhooks";

export async function getBillingOverview(opts?: { includeRequests?: boolean }) {
  const wantRequests = opts?.includeRequests !== false;
  const [subs, webhooks, failed, trialRequests, quotes, purchaseRequests, pendingOrders, tenants, catalog] = await Promise.all([
    listSaasSubscriptions(100),
    listSaasWebhookEvents(20),
    listFailedWebhookEvents(20),
    wantRequests ? listSaasTrialRequests(50) : [],
    wantRequests ? listSaasQuoteRequests(50) : [],
    wantRequests ? listSaasPurchaseRequests(50) : [],
    wantRequests ? listSaasPendingOrders(50) : [],
    listPlatformTenants().catch(() => []),
    getPublishedCatalog().catch(() => null),
  ]);
  const tenantName = new Map(tenants.map((t) => [t.tenantId, t.name]));
  const planName = new Map((catalog?.catalog.plans ?? []).map((p) => [p.key, p.label]));
  const rows = [];
  for (const s of subs) {
    const [enf, exc] = await Promise.all([
      resolveSetting({ tenantId: s.tenantId }, "billing.enforcement").catch(() => null),
      resolveSetting({ tenantId: s.tenantId }, "billing.exception").catch(() => null),
    ]);
    rows.push({
      tenantId: s.tenantId,
      tenantName: tenantName.get(s.tenantId) ?? null,
      planKey: s.planKey,
      planLabel: planName.get(s.planKey) ?? s.priceSnapshot.planLabel ?? planLabel(s.planKey),
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
      executionModel: s.executionModel,
      merchantAccount: s.merchantAccount,
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
    tenants: tenants.map((t) => ({ tenantId: t.tenantId, name: t.name })),
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
    quoteRequests: quotes.map((r) => ({
      id: r.id,
      institutionName: r.institutionName,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      ownerPhone: r.ownerPhone,
      planKey: r.planKey,
      planLabel: r.planKey ? (planName.get(r.planKey) ?? planLabel(r.planKey)) : null,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
    })),
    purchaseRequests: purchaseRequests.map((r) => ({
      id: r.id,
      planKey: r.planKey,
      planLabel: planName.get(r.planKey) ?? planLabel(r.planKey),
      interval: r.interval,
      institutionName: r.institutionName,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      ownerPhone: r.ownerPhone,
      status: r.status,
      tenantId: r.tenantId,
      createdAt: r.createdAt,
    })),
    // Satın alma hunisi taslakları (provisional — aktif müşteri sayılmaz).
    pendingOrders: pendingOrders.map((r) => ({
      id: r.id,
      planKey: r.planKey,
      planLabel: planName.get(r.planKey) ?? planLabel(r.planKey),
      interval: r.interval,
      institutionName: r.institutionName,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      ownerPhone: r.ownerPhone,
      status: r.status,
      subscriptionId: r.subscriptionId,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}
