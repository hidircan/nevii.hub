/**
 * SaaS tahsilat sağlayıcı adapter katmanı (çok sağlayıcılı).
 *
 * - Her abonelik kendi sağlayıcısını taşır; `getDefaultProviderForNew()`
 *   YALNIZCA YENİ abonelikler içindir ve eskileri sessizce taşımaz.
 * - Eski işlemlerin callback/sorgu/iadeleri, kayıttaki sağlayıcıya gider.
 * - Desteklenmeyen özellik taklit edilmez: capability yoksa açık
 *   UNSUPPORTED hatası döner.
 * - `mock` YALNIZCA local/test içindir ve sonucunu her zaman etiketler.
 *
 * Yürütme modelleri:
 * - iyzico: PROVIDER_MANAGED (yenilemeyi sağlayıcı zamanlar; uygulamada
 *   ikinci çekim YOK).
 * - PayTR: MERCHANT_SCHEDULED (uygulama dönem geldiğinde kayıtlı karttan
 *   ister; dayanıklı job + idempotency ile).
 */
import { uid } from "../utils";
import type {
  SaasBillingInterval,
  SaasExecutionModel,
  SaasProviderId,
  SaasSubscriptionStatus,
} from "./types";
import {
  hasCapability,
  liveChargeGate,
  unsupportedError,
  type ProviderCapability,
} from "./providers";
import {
  cancelIyzicoSubscription,
  initializeCardUpdateCheckoutForm,
  initializeSubscriptionCheckoutForm,
  isIyzicoSubConfigured,
  IYZICO_SUB_BASE_URL_SANDBOX,
  iyzicoPlanRefFor,
  mapIyzicoSubscriptionStatus,
  retrieveSubscriptionCheckoutFormResult,
  retryIyzicoSubscriptionPayment,
  getIyzicoSubConfig,
} from "./iyzico-subscription";
import {
  getPaytrConfig,
  isPaytrConfigured,
  newPaytrMerchantOid,
  paytrMissingPreconditions,
  paytrCardRegisterPreconditions,
  paytrListCards,
  paytrQueryStatus,
  paytrRecurringCharge,
  buildPaytrCardRegisterForm,
  paytrCurrencyFor,
} from "./paytr-subscription";

/** @deprecated Yeni kod SaasProviderId kullansın. */
export type SaasProviderName = SaasProviderId;

/**
 * YENİ abonelikler için varsayılan sağlayıcı. Ticari karar: PayTR birinci
 * hedef; yapılandırılmamışsa iyzico; hiçbiri yoksa kapalı.
 */
export function getDefaultProviderForNew(): SaasProviderId {
  const p = (process.env.SAAS_BILLING_PROVIDER || "").toLowerCase();
  if (p === "paytr" || p === "iyzico" || p === "mock") return p;
  if (isPaytrConfigured()) return "paytr";
  if (isIyzicoSubConfigured()) return "iyzico";
  return "none";
}

/** @deprecated getDefaultProviderForNew kullanın (yalnız yeni abonelikler). */
export function getSaasProviderName(): SaasProviderName {
  return getDefaultProviderForNew();
}

export type SaasCheckoutInitInput = {
  tenantId: string;
  planKey: string;
  billingInterval: SaasBillingInterval;
  amountMinor: number;
  currency?: import("./types").SaasCurrency;
  callbackUrl: string;
  okUrl?: string;
  failUrl?: string;
  userIp?: string;
  idempotencyKey: string;
  /** Mevcut PayTR kullanıcısı (kart ekleme) — varsa yeni kart aynı kullanıcıya bağlanır. */
  customerRef?: string | null;
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
      kind: "embed_html";
      /** Gömülü checkout form HTML'i (iyzico CF) — kart hosted'ta alınır. */
      checkoutFormContent: string;
      providerReference: string;
      tokenExpireSeconds: number;
      mock: boolean;
    }
  | {
      ok: true;
      kind: "form_post";
      /** Doğrudan sağlayıcıya POST edilecek form (PayTR) — kart sunucuya uğramaz. */
      postUrl: string;
      fields: Record<string, string>;
      providerReference: string;
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

export type SaasServerChargeInput = {
  merchantOid: string;
  email: string;
  userIp: string;
  amountMinor: number;
  currency: import("./types").SaasCurrency;
  customerRef: string;
  cardRef: string;
};

export type SaasServerChargeResult =
  | { ok: true; outcome: "success" | "wait_callback" }
  | { ok: true; outcome: "failed"; reason: string; retryable: boolean }
  | { ok: false; error: string; errorCode: string };

export interface SaasBillingProvider {
  /** Sağlayıcı kimliği (== name). */
  id: SaasProviderId;
  /** @deprecated id kullanın. */
  name: string;
  executionModel: SaasExecutionModel | null;
  capabilities: ProviderCapability[];
  isConfigured(): boolean;
  /** Açık önkoşul listesi (owner kontrol listesi için). */
  missingPreconditions(): string[];
  /** Merchant hesabı etiketi ("paytr:<id>" vb.). */
  merchantAccount(): string;
  mapStatus(providerStatus: string): SaasSubscriptionStatus | null;
  initializeCheckout(input: SaasCheckoutInitInput): Promise<SaasCheckoutInitResult>;
  retrieveCheckoutResult(token: string, conversationId?: string): Promise<SaasRetrieveResult>;
  cancelSubscription(subscriptionRef: string): Promise<{ ok: boolean; error?: string }>;
  retryPayment(orderRef: string): Promise<{ ok: boolean; error?: string }>;
  initializeCardUpdate(args: {
    subscriptionRef: string;
    callbackUrl: string;
    conversationId: string;
    okUrl?: string;
    failUrl?: string;
    userIp?: string;
    customerRef?: string | null;
  }): Promise<SaasCheckoutInitResult>;
  /** Kayıtlı araçtan server-to-server tahsilat (capability: server_charge). */
  serverCharge(input: SaasServerChargeInput): Promise<SaasServerChargeResult>;
  /** İşlem durum sorgusu (capability: status_query). */
  queryChargeStatus(merchantOid: string): Promise<
    | { ok: true; found: boolean; status: "success" | "failed" | "unknown"; totalAmountMinor: number | null }
    | { ok: false; error: string; errorCode: string }
  >;
  /** Kayıtlı kartları listele (ctoken çözümü) — desteklenmiyorsa UNSUPPORTED. */
  listStoredCards?(customerRef: string): Promise<
    | { ok: true; cards: { cardRef: string; requireCvv: boolean }[] }
    | { ok: false; error: string; errorCode: string }
  >;
}

function iyzicoProvider(): SaasBillingProvider {
  const base = {
    id: "iyzico" as SaasProviderId,
    name: "iyzico",
    executionModel: "PROVIDER_MANAGED" as SaasExecutionModel,
    capabilities: [
      "embed_checkout_html",
      "retrieve_by_token",
      "provider_renewal",
      "card_update_form",
      "remote_cancel",
    ] as ProviderCapability[],
    isConfigured: () => isIyzicoSubConfigured(),
    missingPreconditions: () => {
      const c = getIyzicoSubConfig();
      const m: string[] = [];
      if (!c.apiKey || !c.secretKey || !c.merchantId) m.push("iyzico API/secret key + merchant ID tanımlı değil.");
      return m;
    },
    merchantAccount: () => `iyzico:${getIyzicoSubConfig().merchantId || "unconfigured"}`,
    mapStatus: (s: string) => mapIyzicoSubscriptionStatus(s),
  };
  return {
    ...base,
    async initializeCheckout(input) {
      const gate = liveChargeGate({
        provider: "iyzico",
        live: getIyzicoSubConfig().baseUrl !== IYZICO_SUB_BASE_URL_SANDBOX,
      });
      if (!gate.ok) return { ok: false, error: gate.error, errorCode: gate.errorCode };
      const planRef = iyzicoPlanRefFor(input.planKey, input.billingInterval);
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
        kind: "embed_html",
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
      const gate = liveChargeGate({
        provider: "iyzico",
        live: getIyzicoSubConfig().baseUrl !== IYZICO_SUB_BASE_URL_SANDBOX,
      });
      if (!gate.ok) return { ok: false, error: gate.error };
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
        kind: "embed_html",
        checkoutFormContent: res.data.checkoutFormContent,
        providerReference: res.data.token,
        tokenExpireSeconds: res.data.tokenExpireTime,
        mock: false,
      };
    },
    async serverCharge() {
      return unsupportedError("iyzico", "server-to-server tahsilat");
    },
    async queryChargeStatus() {
      return unsupportedError("iyzico", "sipariş durum sorgusu");
    },
  };
}

function paytrProvider(): SaasBillingProvider {
  return {
    id: "paytr",
    name: "paytr",
    executionModel: "MERCHANT_SCHEDULED",
    // Not: ayrı kart-güncelleme formu YOK — PayTR'de kart, dönem borcu
    // tahsilatıyla (checkout akışıyla) birlikte güncellenir.
    capabilities: ["form_post_checkout", "server_charge", "status_query"],
    isConfigured: () => isPaytrConfigured(),
    missingPreconditions: () => paytrMissingPreconditions(),
    merchantAccount: () => `paytr:${getPaytrConfig().merchantId || "unconfigured"}`,
    /**
     * PayTR'de abonelik nesnesi YOK; bu eşleme ÖDEME sonucu → domain
     * önerisidir (yenileme olaylarında kullanılır).
     */
    mapStatus: (s: string) => {
      const v = s.trim().toLowerCase();
      if (v === "success") return "active";
      if (v === "failed" || v === "failure") return "past_due";
      if (v === "wait" || v === "wait_callback" || v === "pending") return "pending";
      return null;
    },
    async initializeCheckout(input) {
      const missing = paytrCardRegisterPreconditions();
      if (missing.length > 0) {
        return { ok: false, error: missing[0], errorCode: "PRECONDITION_MISSING" };
      }
      const gate = liveChargeGate({ provider: "paytr", live: getPaytrConfig().testMode === "0" });
      if (!gate.ok) return { ok: false, error: gate.error, errorCode: gate.errorCode };
      if (!input.userIp) {
        return { ok: false, error: "PayTR user_ip zorunlu.", errorCode: "USER_IP_MISSING" };
      }
      try {
        paytrCurrencyFor(input.currency ?? "TRY");
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Para birimi desteklenmiyor.", errorCode: "CURRENCY_UNSUPPORTED" };
      }
      const merchantOid = newPaytrMerchantOid();
      const form = buildPaytrCardRegisterForm({
        merchantOid,
        email: input.customer.email,
        userIp: input.userIp,
        amountMinor: input.amountMinor,
        currency: input.currency ?? "TRY",
        utoken: input.customerRef ?? undefined,
        okUrl: input.okUrl ?? input.callbackUrl,
        failUrl: input.failUrl ?? input.callbackUrl,
      });
      return {
        ok: true,
        kind: "form_post",
        postUrl: form.postUrl,
        fields: form.fields,
        providerReference: merchantOid,
        mock: false,
      };
    },
    async retrieveCheckoutResult() {
      return unsupportedError("paytr", "token ile sonuç sorgusu (hakikat: callback + durum sorgusu)");
    },
    async cancelSubscription() {
      // PayTR'de iptal edilecek uzak abonelik nesnesi yok; iptal = yerel
      // zamanlamayı durdurma. Taklit amaçlı uzak çağrı yapılmaz.
      return unsupportedError("paytr", "uzak abonelik iptali (yerel iptal geçerlidir)");
    },
    async retryPayment() {
      return unsupportedError("paytr", "doğrudan retry (scheduler yeni deneme açar)");
    },
    async initializeCardUpdate(args) {
      const missing = paytrCardRegisterPreconditions();
      if (missing.length > 0) {
        return { ok: false, error: missing[0], errorCode: "PRECONDITION_MISSING" };
      }
      if (!args.userIp) {
        return { ok: false, error: "PayTR user_ip zorunlu.", errorCode: "USER_IP_MISSING" };
      }
      // Kart güncelleme = mevcut kullanıcıya yeni kart kaydı (sembolik 0 tutar
      // YOK — PayTR provizyon tutarı gerektirir; en küçük tahsil edilebilir
      // tutar dönem borcu kadardır ve checkout akışıyla alınır).
      return {
        ok: false,
        error: "PayTR kart güncelleme, dönem borcu tahsilatıyla birlikte yapılır (ayrı sıfır-tutarlı provizyon yok).",
        errorCode: "CARD_UPDATE_VIA_CHARGE",
      };
    },
    async serverCharge(input) {
      if (!isPaytrConfigured()) {
        return { ok: false, error: paytrMissingPreconditions()[0] ?? "PayTR yapılandırılmadı.", errorCode: "PRECONDITION_MISSING" };
      }
      const gate = liveChargeGate({ provider: "paytr", live: getPaytrConfig().testMode === "0" });
      if (!gate.ok) return { ok: false, error: gate.error, errorCode: gate.errorCode };
      const res = await paytrRecurringCharge({
        merchantOid: input.merchantOid,
        email: input.email,
        userIp: input.userIp,
        amountMinor: input.amountMinor,
        currency: input.currency,
        utoken: input.customerRef,
        ctoken: input.cardRef,
      });
      if (!res.ok) return { ok: false, error: res.error, errorCode: res.errorCode };
      if (res.data.outcome === "failed") {
        return { ok: true, outcome: "failed", reason: res.data.reason, retryable: res.data.retryable };
      }
      return { ok: true, outcome: res.data.outcome };
    },
    async queryChargeStatus(merchantOid: string) {
      const res = await paytrQueryStatus(merchantOid);
      if (!res.ok) return { ok: false, error: res.error, errorCode: res.errorCode };
      if (!res.data.found) {
        return { ok: true, found: false, status: "unknown", totalAmountMinor: null };
      }
      return { ok: true, found: true, status: res.data.status, totalAmountMinor: res.data.totalAmountMinor };
    },
    async listStoredCards(customerRef: string) {
      const res = await paytrListCards(customerRef);
      if (!res.ok) return { ok: false, error: res.error, errorCode: res.errorCode };
      return {
        ok: true,
        cards: res.data.map((c) => ({ cardRef: c.ctoken, requireCvv: c.requireCvv })),
      };
    },
  };
}

function mockProvider(): SaasBillingProvider {
  const tokenFor = (key: string) => `mock_${key}`;
  return {
    id: "mock",
    name: "mock",
    executionModel: "PROVIDER_MANAGED",
    capabilities: [
      "embed_checkout_html",
      "retrieve_by_token",
      "provider_renewal",
      "card_update_form",
      "remote_cancel",
      "server_charge",
      "status_query",
    ],
    isConfigured: () => true,
    missingPreconditions: () => [],
    merchantAccount: () => "mock:test",
    mapStatus: (s: string) => {
      const v = s.trim().toLowerCase();
      if (v === "active") return "active";
      if (v === "failed") return "past_due";
      if (v === "pending") return "pending";
      if (v === "canceled") return "canceled";
      return null;
    },
    async initializeCheckout(input) {
      return {
        ok: true,
        kind: "embed_html",
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
        kind: "embed_html",
        checkoutFormContent: `<div data-mock-card-update="${args.conversationId}">MOCK kart güncelleme</div>`,
        providerReference: tokenFor(args.conversationId),
        tokenExpireSeconds: 3600,
        mock: true,
      };
    },
    async serverCharge() {
      return { ok: true, outcome: "success" };
    },
    async queryChargeStatus() {
      return { ok: true, found: true, status: "success", totalAmountMinor: null };
    },
    async listStoredCards() {
      return { ok: true, cards: [{ cardRef: "mock_ctoken_1", requireCvv: false }] };
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
    id: "none",
    name: "none",
    executionModel: null,
    capabilities: [],
    isConfigured: () => false,
    missingPreconditions: () => ["Sağlayıcı seçilmedi/yapılandırılmadı."],
    merchantAccount: () => "",
    mapStatus: () => null,
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
    async serverCharge() {
      return err;
    },
    async queryChargeStatus() {
      return err;
    },
  };
}

/**
 * Kayıtlı sağlayıcı örneği — abonelikteki/işlemdeki sağlayıcı kimliğiyle
 * çağrılır. Global ayar buraya GİREMEZ (eski işlemler eski adaptöre gider).
 */
export function getSaasProvider(id: SaasProviderId): SaasBillingProvider {
  if (id === "paytr") return paytrProvider();
  if (id === "iyzico") return iyzicoProvider();
  if (id === "mock") return mockProvider();
  return noneProvider();
}

/** @deprecated getSaasProvider(getDefaultProviderForNew()) kullanın. */
export function getSaasBillingProvider(): SaasBillingProvider {
  return getSaasProvider(getDefaultProviderForNew());
}

export { hasCapability };
export type { ProviderCapability, SaasExecutionModel };

export function newSaasIdempotencyKey(prefix = "saas"): string {
  return `${prefix}_${uid("idem")}`;
}
