/**
 * SaaS tahsilat sağlayıcı adapter katmanı.
 *
 * V1'de TEK gerçek entegrasyon: iyzico Abonelik (sandbox). `mock` sağlayıcı
 * YALNIZCA local/test içindir ve sonucunu her zaman "mock — gerçek tahsilat
 * değildir" diye etiketler; raporlarda gerçek sandbox kanıtıyla karıştırılmaz.
 *
 * Otomatik yenileme iyzico tarafından zamanlanır → uygulamada ikinci bir
 * cron ile aynı dönem için YENİDEN ÇEKİM YAPILMAZ. Uygulama tarafı yalnız
 * webhook + mutabakat ile durumu izler.
 */
import { uid } from "../utils";
import type { SaasBillingInterval } from "./types";
import {
  cancelIyzicoSubscription,
  getIyzicoSubConfig,
  initializeCardUpdateCheckoutForm,
  initializeSubscriptionCheckoutForm,
  isIyzicoSubConfigured,
  retrieveSubscriptionCheckoutFormResult,
  retryIyzicoSubscriptionPayment,
} from "./iyzico-subscription";

export type SaasProviderName = "iyzico" | "mock" | "none";

export function getSaasProviderName(): SaasProviderName {
  const p = (process.env.SAAS_BILLING_PROVIDER || "").toLowerCase();
  if (p === "iyzico") return "iyzico";
  if (p === "mock") return "mock";
  // Güvenli varsayılan: yapılandırılmış iyzico varsa o, yoksa kapalı.
  if (isIyzicoSubConfigured()) return "iyzico";
  return "none";
}

export type SaasCheckoutInitInput = {
  tenantId: string;
  planKey: string;
  billingInterval: SaasBillingInterval;
  /** Gösterim/önizleme amaçlı; tahsil tutarı sağlayıcı planından gelir. */
  amountMinor: number;
  callbackUrl: string;
  idempotencyKey: string;
  customer: {
    name: string;
    surname: string;
    email: string;
    gsmNumber: string;
    identityNumber: string;
    address: string;
    city: string;
    country: string;
  };
};

export type SaasCheckoutInitResult =
  | {
      ok: true;
      /** Gömülü checkout form HTML'i (iyzico CF) — kart hosted'ta alınır. */
      checkoutFormContent: string;
      providerReference: string;
      tokenExpireSeconds: number;
      mock: boolean;
    }
  | { ok: false; error: string; errorCode: string };

export type SaasRetrieveResult =
  | {
      ok: true;
      subscriptionRef: string;
      customerRef: string;
      providerStatus: string;
      pricingPlanRef: string;
      mock: boolean;
    }
  | { ok: false; error: string; errorCode: string };

export interface SaasBillingProvider {
  name: string;
  isConfigured(): boolean;
  /** Abonelik checkout formu başlatır (kart hosted'ta, sunucuya gelmez). */
  initializeCheckout(input: SaasCheckoutInitInput): Promise<SaasCheckoutInitResult>;
  /** Callback sonrası server-to-server sonuç doğrulaması. */
  retrieveCheckoutResult(
    token: string,
    conversationId?: string
  ): Promise<SaasRetrieveResult>;
  cancelSubscription(subscriptionRef: string): Promise<{ ok: boolean; error?: string }>;
  retryPayment(orderRef: string): Promise<{ ok: boolean; error?: string }>;
  initializeCardUpdate(args: {
    subscriptionRef: string;
    callbackUrl: string;
    conversationId: string;
  }): Promise<SaasCheckoutInitResult>;
}

function planRefFor(planKey: string, interval: SaasBillingInterval): string | null {
  const cfg = getIyzicoSubConfig();
  return cfg.planRefs[`${planKey}:${interval}`] ?? null;
}

function iyzicoProvider(): SaasBillingProvider {
  return {
    name: "iyzico",
    isConfigured: () => isIyzicoSubConfigured(),
    async initializeCheckout(input) {
      const planRef = planRefFor(input.planKey, input.billingInterval);
      if (!planRef) {
        return {
          ok: false,
          error: `Bu paket için iyzico plan referansı tanımlı değil (${input.planKey}:${input.billingInterval}).`,
          errorCode: "PLAN_REF_MISSING",
        };
      }
      const res = await initializeSubscriptionCheckoutForm({
        pricingPlanReferenceCode: planRef,
        subscriptionInitialStatus: "ACTIVE",
        callbackUrl: input.callbackUrl,
        conversationId: input.idempotencyKey,
        customer: {
          name: input.customer.name,
          surname: input.customer.surname,
          email: input.customer.email,
          gsmNumber: input.customer.gsmNumber,
          identityNumber: input.customer.identityNumber,
          billingAddress: {
            address: input.customer.address,
            contactName: `${input.customer.name} ${input.customer.surname}`.slice(0, 100),
            city: input.customer.city,
            country: input.customer.country,
          },
        },
      });
      if (!res.ok) return { ok: false, error: res.error, errorCode: res.errorCode };
      return {
        ok: true,
        checkoutFormContent: res.data.checkoutFormContent,
        providerReference: res.data.token,
        tokenExpireSeconds: res.data.tokenExpireTime,
        mock: false,
      };
    },
    async retrieveCheckoutResult(token, conversationId) {
      const res = await retrieveSubscriptionCheckoutFormResult(token, conversationId);
      if (!res.ok) return { ok: false, error: res.error, errorCode: res.errorCode };
      if (!res.data.data?.referenceCode) {
        return { ok: false, error: "Sağlayıcı sonucu abonelik referansı içermiyor.", errorCode: "NO_SUBSCRIPTION_REF" };
      }
      return {
        ok: true,
        subscriptionRef: res.data.data.referenceCode,
        customerRef: res.data.data.customerReferenceCode,
        providerStatus: res.data.data.subscriptionStatus,
        pricingPlanRef: res.data.data.pricingPlanReferenceCode,
        mock: false,
      };
    },
    async cancelSubscription(subscriptionRef) {
      const res = await cancelIyzicoSubscription(subscriptionRef);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    async retryPayment(orderRef) {
      const res = await retryIyzicoSubscriptionPayment(orderRef);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    async initializeCardUpdate(args) {
      const res = await initializeCardUpdateCheckoutForm({
        subscriptionReferenceCode: args.subscriptionRef,
        callbackUrl: args.callbackUrl,
        conversationId: args.conversationId,
      });
      if (!res.ok) return { ok: false, error: res.error, errorCode: res.errorCode };
      return {
        ok: true,
        checkoutFormContent: res.data.checkoutFormContent,
        providerReference: res.data.token,
        tokenExpireSeconds: res.data.tokenExpireTime,
        mock: false,
      };
    },
  };
}

/**
 * Mock sağlayıcı — local/test. Dönen her sonuç `mock: true` taşır ve
 * ASLA gerçek tahsilat gibi raporlanmaz.
 */
function mockProvider(): SaasBillingProvider {
  const tokenFor = (key: string) => `mock_${key}`;
  return {
    name: "mock",
    isConfigured: () => true,
    async initializeCheckout(input) {
      return {
        ok: true,
        checkoutFormContent: `<div data-mock-checkout="${input.idempotencyKey}">MOCK checkout (gerçek tahsilat değildir)</div>`,
        providerReference: tokenFor(input.idempotencyKey),
        tokenExpireSeconds: 3600,
        mock: true,
      };
    },
    async retrieveCheckoutResult(token) {
      if (!token.startsWith("mock_")) {
        return { ok: false, error: "Mock token değil.", errorCode: "MOCK_TOKEN_MISMATCH" };
      }
      return {
        ok: true,
        subscriptionRef: `mock_sub_${token.slice(5)}`,
        customerRef: `mock_cus_${token.slice(5)}`,
        providerStatus: "ACTIVE",
        pricingPlanRef: "mock_plan",
        mock: true,
      };
    },
    async cancelSubscription() {
      return { ok: true };
    },
    async retryPayment() {
      return { ok: true };
    },
    async initializeCardUpdate(args) {
      return {
        ok: true,
        checkoutFormContent: `<div data-mock-card-update="${args.conversationId}">MOCK kart güncelleme</div>`,
        providerReference: tokenFor(args.conversationId),
        tokenExpireSeconds: 3600,
        mock: true,
      };
    },
  };
}

function noneProvider(): SaasBillingProvider {
  const err = {
    ok: false as const,
    error: "SaaS tahsilat sağlayıcısı yapılandırılmadı. Gerçek checkout kapalı.",
    errorCode: "NOT_CONFIGURED",
  };
  return {
    name: "none",
    isConfigured: () => false,
    async initializeCheckout() {
      return err;
    },
    async retrieveCheckoutResult() {
      return err;
    },
    async cancelSubscription() {
      return { ok: false, error: err.error };
    },
    async retryPayment() {
      return { ok: false, error: err.error };
    },
    async initializeCardUpdate() {
      return err;
    },
  };
}

export function getSaasBillingProvider(): SaasBillingProvider {
  const name = getSaasProviderName();
  if (name === "iyzico") return iyzicoProvider();
  if (name === "mock") return mockProvider();
  return noneProvider();
}

export function newSaasIdempotencyKey(prefix = "saas"): string {
  return `${prefix}_${uid("idem")}`;
}
