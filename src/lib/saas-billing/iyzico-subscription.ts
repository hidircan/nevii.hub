/**
 * iyzico Abonelik (Subscription) istemcisi — TEK gerçek sandbox entegrasyonu.
 *
 * Kaynak: iyzico güncel resmi dokümantasyonu (docs.iyzico.com, Ekim 2026'da
 * doğrulandı):
 * - Webhook: /en/advanced/webhook — Subscription Format + "Validation of
 *   Subscription Format" imza formülü.
 * - Abonelik işlemleri: /en/products/subscription/subscription-implementation/
 *   subscription-transactions (checkoutform initialize/retrieve, activate,
 *   retry, upgrade, cancel, detail, search, card-update).
 *
 * Güvenlik sınırları:
 * - YALNIZCA Checkout Form (hosted) kullanılır. NON-3DS initialize
 *   BİLİNÇLİ OLARAK YOK: kart verisi sunucumuza ulaşırdı (PCI yükü).
 * - PAN/CVV bu dosyada, DB'de, logda, analytics'te ASLA yer almaz.
 * - İmza: X-IYZ-SIGNATURE-V3, abonelik formülü:
 *     key = merchantId + secretKey + eventType + subscriptionReferenceCode
 *           + orderReferenceCode + customerReferenceCode
 *     HMAC-SHA256(secretKey, key) → hex
 * - Hesapta "Merchant Subscription Notifications" URL'i + imza özelliği
 *   etkin değilse endpoint güvenilir sayılmaz (fail-closed).
 * - Callback'e gelen "başarılı" dönüşü ödeme kanıtı DEĞİLDİR: her zaman
 *   server-to-server retrieve (GET checkoutform/{token}) ile doğrulanır.
 * - SANDBOX'A KARŞI HENÜZ ÇALIŞTIRILMADI: merchant anahtarları owner'da.
 *   `isConfigured()` false iken hiçbir gerçek HTTP çağrısı yapılmaz.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { iyzwsV2AuthorizationHeader } from "../payment-provider/providers/iyzico";

export const IYZICO_SUB_BASE_URL_SANDBOX = "https://sandbox-api.iyzipay.com";
export const IYZICO_SUB_BASE_URL_PROD = "https://api.iyzipay.com";

const CF_INITIALIZE_PATH = "/v2/subscription/checkoutform/initialize";
const CF_RETRIEVE_PREFIX = "/v2/subscription/checkoutform/";
const DETAIL_PREFIX = "/v2/subscription/subscriptions/";
const RETRY_PATH = "/v2/subscription/operation/retry";
const CARD_UPDATE_INIT_PATH = "/v2/subscription/card-update-checkoutform/initialize";

export type IyzicoSubConfig = {
  apiKey: string;
  secretKey: string;
  merchantId: string;
  webhookSecret: string;
  baseUrl: string;
  /** planKey:interval → iyzico pricingPlanReferenceCode (panelden alınır). */
  planRefs: Record<string, string>;
};

function parsePlanRefs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

export function getIyzicoSubConfig(): IyzicoSubConfig {
  return {
    apiKey: process.env.IYZICO_API_KEY || "",
    secretKey: process.env.IYZICO_SECRET_KEY || "",
    merchantId: process.env.IYZICO_MERCHANT_ID || "",
    webhookSecret: process.env.IYZICO_WEBHOOK_SECRET || process.env.IYZICO_SECRET_KEY || "",
    baseUrl: process.env.IYZICO_BASE_URL || IYZICO_SUB_BASE_URL_SANDBOX,
    planRefs: parsePlanRefs(process.env.IYZICO_SUBSCRIPTION_PLAN_REFS || ""),
  };
}

export function isIyzicoSubConfigured(): boolean {
  const c = getIyzicoSubConfig();
  return Boolean(c.apiKey && c.secretKey && c.merchantId);
}

/** iyzico sağlayıcı durumları → ortak domain durumu. Bilinmeyende null (fail-closed). */
export function mapIyzicoSubscriptionStatus(
  providerStatus: string
): import("./types").SaasSubscriptionStatus | null {
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

/** planKey:interval → iyzico pricingPlanReferenceCode (panelden, env ile). */
export function iyzicoPlanRefFor(
  planKey: string,
  interval: import("./types").SaasBillingInterval
): string | null {
  const cfg = getIyzicoSubConfig();
  return cfg.planRefs[`${planKey}:${interval}`] ?? null;
}

/** Abonelik webhook imza doğrulaması (resmi formül, Ekim 2026). */
export function iyzicoSubscriptionWebhookSignature(
  secretKey: string,
  fields: {
    merchantId: string;
    eventType: string;
    subscriptionReferenceCode: string;
    orderReferenceCode: string;
    customerReferenceCode: string;
  }
): string {
  const key =
    fields.merchantId +
    secretKey +
    fields.eventType +
    fields.subscriptionReferenceCode +
    fields.orderReferenceCode +
    fields.customerReferenceCode;
  return createHmac("sha256", secretKey).update(key, "utf8").digest("hex");
}

export type IyzicoSubWebhookPayload = {
  orderReferenceCode: string;
  customerReferenceCode: string;
  subscriptionReferenceCode: string;
  iyziReferenceCode: string;
  iyziEventType: "subscription.order.success" | "subscription.order.failure";
  iyziEventTime: number;
};

export function verifyIyzicoSubWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
}): { ok: true; payload: IyzicoSubWebhookPayload } | { ok: false; error: string } {
  const cfg = getIyzicoSubConfig();
  if (!cfg.webhookSecret || !cfg.merchantId) {
    return { ok: false, error: "iyzico abonelik webhook secret/merchantId yapılandırılmadı." };
  }
  if (!input.signatureHeader) {
    return { ok: false, error: "X-IYZ-SIGNATURE-V3 header'ı eksik." };
  }
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Webhook gövdesi JSON değil." };
  }
  const fields = {
    merchantId: cfg.merchantId,
    eventType: String(p.iyziEventType ?? ""),
    subscriptionReferenceCode: String(p.subscriptionReferenceCode ?? ""),
    orderReferenceCode: String(p.orderReferenceCode ?? ""),
    customerReferenceCode: String(p.customerReferenceCode ?? ""),
  };
  if (
    !fields.eventType ||
    !fields.subscriptionReferenceCode ||
    !fields.orderReferenceCode ||
    !fields.customerReferenceCode
  ) {
    return { ok: false, error: "Abonelik webhook alanları eksik." };
  }
  if (
    fields.eventType !== "subscription.order.success" &&
    fields.eventType !== "subscription.order.failure"
  ) {
    return { ok: false, error: `Bilinmeyen abonelik olayı: ${fields.eventType}` };
  }
  const expected = iyzicoSubscriptionWebhookSignature(cfg.webhookSecret, fields);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signatureHeader, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "Webhook imzası geçersiz." };
  }
  return {
    ok: true,
    payload: {
      orderReferenceCode: fields.orderReferenceCode,
      customerReferenceCode: fields.customerReferenceCode,
      subscriptionReferenceCode: fields.subscriptionReferenceCode,
      iyziReferenceCode: String(p.iyziReferenceCode ?? ""),
      iyziEventType: fields.eventType,
      iyziEventTime: Number(p.iyziEventTime ?? 0),
    },
  };
}

// ───────────── API istemcisi (IYZWSv2) ─────────────

function randomKey(): string {
  return String(Date.now()) + Math.random().toString(36).slice(2, 12);
}

type IyzicoApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode: string };

async function signedRequest<T>(
  method: "GET" | "POST",
  uriPath: string,
  body: Record<string, unknown> | null,
  timeoutMs = 15000
): Promise<IyzicoApiResult<T>> {
  const cfg = getIyzicoSubConfig();
  if (!isIyzicoSubConfigured()) {
    return { ok: false, error: "iyzico yapılandırılmadı.", errorCode: "NOT_CONFIGURED" };
  }
  const bodyJson = body ? JSON.stringify(body) : "";
  const rnd = randomKey();
  const authorization = iyzwsV2AuthorizationHeader(
    cfg.apiKey,
    cfg.secretKey,
    rnd,
    uriPath,
    bodyJson
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}${uriPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        "x-iyzi-rnd": rnd,
      },
      body: method === "POST" ? bodyJson : undefined,
      signal: ctrl.signal,
    });
    const json = (await res.json()) as {
      status?: string;
      errorMessage?: string;
      errorCode?: string;
    } & Record<string, unknown>;
    if (json.status !== "success") {
      return {
        ok: false,
        error: json.errorMessage || "iyzico isteği başarısız.",
        errorCode: json.errorCode || "PROVIDER_ERROR",
      };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    // Timeout/kesinti tek başına "ödenmedi" kanıtı DEĞİLDİR — çağrıcı
    // bunu pending/retry olarak ele almalı, olumsuz hüküm vermemelidir.
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "iyzico zaman aşımı." : e instanceof Error ? e.message : "iyzico bağlantı hatası.",
      errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

export type SubCheckoutFormInitInput = {
  pricingPlanReferenceCode: string;
  subscriptionInitialStatus: "ACTIVE" | "PENDING";
  callbackUrl: string;
  conversationId: string;
  customer: {
    name: string;
    surname: string;
    email: string;
    gsmNumber: string;
    identityNumber: string;
    billingAddress: {
      address: string;
      contactName: string;
      city: string;
      country: string;
      zipCode?: string;
    };
  };
};

export type SubCheckoutFormInitResult = {
  status: string;
  token: string;
  checkoutFormContent: string;
  tokenExpireTime: number;
  conversationId?: string;
};

export async function initializeSubscriptionCheckoutForm(
  input: SubCheckoutFormInitInput
): Promise<IyzicoApiResult<SubCheckoutFormInitResult>> {
  return signedRequest<SubCheckoutFormInitResult>("POST", CF_INITIALIZE_PATH, {
    locale: "tr",
    callbackUrl: input.callbackUrl,
    pricingPlanReferenceCode: input.pricingPlanReferenceCode,
    subscriptionInitialStatus: input.subscriptionInitialStatus,
    conversationId: input.conversationId,
    customer: input.customer,
  });
}

export type SubCheckoutFormResult = {
  status: string;
  token: string;
  data?: {
    referenceCode: string;
    parentReferenceCode: string;
    customerReferenceCode: string;
    subscriptionStatus: "ACTIVE" | "PENDING";
    pricingPlanReferenceCode: string;
    trialDays?: number;
    trialStartDate?: number;
    trialEndDate?: number;
    createdDate?: number;
    startDate?: number;
    endDate?: number;
  };
};

/** Callback sonrası server-to-server doğrulama (ödeme kanıtı budur, redirect değil). */
export async function retrieveSubscriptionCheckoutFormResult(
  token: string,
  conversationId?: string
): Promise<IyzicoApiResult<SubCheckoutFormResult>> {
  const qp = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  return signedRequest<SubCheckoutFormResult>("GET", `${CF_RETRIEVE_PREFIX}${token}${qp}`, null);
}

export type IyzicoSubscriptionDetail = {
  referenceCode: string;
  customerReferenceCode: string;
  pricingPlanReferenceCode: string;
  subscriptionStatus: "ACTIVE" | "PENDING" | "UNPAID" | "UPGRADED" | "CANCELED" | "EXPIRED";
  trialDays?: number;
  trialStartDate?: number;
  trialEndDate?: number;
  createdDate?: number;
  startDate?: number;
  endDate?: number;
};

/** Mutabakat ve durum doğrulama için server-to-server abonelik detayı. */
export async function getIyzicoSubscriptionDetail(
  subscriptionReferenceCode: string
): Promise<IyzicoApiResult<{ data: { items: IyzicoSubscriptionDetail[] } }>> {
  return signedRequest("GET", `${DETAIL_PREFIX}${subscriptionReferenceCode}`, null);
}

export async function cancelIyzicoSubscription(
  subscriptionReferenceCode: string
): Promise<IyzicoApiResult<{ status: string }>> {
  return signedRequest("POST", `${DETAIL_PREFIX}${subscriptionReferenceCode}/cancel`, {
    subscriptionReferenceCode,
  });
}

export async function retryIyzicoSubscriptionPayment(
  orderReferenceCode: string
): Promise<IyzicoApiResult<{ status: string }>> {
  return signedRequest("POST", RETRY_PATH, { referenceCode: orderReferenceCode });
}

export async function upgradeIyzicoSubscription(
  subscriptionReferenceCode: string,
  args: { newPricingPlanReferenceCode: string; upgradePeriod: "NOW" | "NEXT_PERIOD" }
): Promise<IyzicoApiResult<{ status: string }>> {
  return signedRequest("POST", `${DETAIL_PREFIX}${subscriptionReferenceCode}/upgrade`, {
    newPricingPlanReferenceCode: args.newPricingPlanReferenceCode,
    upgradePeriod: args.upgradePeriod,
  });
}

/** Kart güncelleme — hosted checkout formu (kart sunucuya gelmez). */
export async function initializeCardUpdateCheckoutForm(args: {
  subscriptionReferenceCode: string;
  callbackUrl: string;
  conversationId: string;
}): Promise<IyzicoApiResult<SubCheckoutFormInitResult>> {
  return signedRequest<SubCheckoutFormInitResult>("POST", CARD_UPDATE_INIT_PATH, {
    locale: "tr",
    subscriptionReferenceCode: args.subscriptionReferenceCode,
    callbackUrl: args.callbackUrl,
    conversationId: args.conversationId,
  });
}
