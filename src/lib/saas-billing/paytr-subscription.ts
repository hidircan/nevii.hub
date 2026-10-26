/**
 * PayTR Direct API istemcisi — kart saklama + kayıtlı kartla tekrarlayan tahsilat.
 *
 * Kaynak: PayTR güncel resmi dokümantasyonu (dev.paytr.com, Ekim 2026'da doğrulandı):
 * - /direkt-api (1. adım: token + form, 2. adım: callback doğrulama)
 * - /direkt-api/kart-saklama-api/yeni-kart-ekleme (CAPI PAYMENT)
 * - /direkt-api/kart-saklama-api/kayitli-kart-listesi (CAPI LIST)
 * - /direkt-api/kart-saklama-api/kayitli-kart-tekrarlayan-odeme
 * - /durum-sorgu
 *
 * Güvenlik sınırları:
 * - İLK KART KAYDI: satıcı formu DOĞRUDAN paytr.com/odeme'ye POST eder
 *   (store_card=1). Kart alanları boş render edilir; PAN/CVV sunucumuza,
 *   DB'ye, loga ASLA ulaşmaz. Sunucu yalnız HMAC token üretir.
 * - Yenilemeler: server-to-server, utoken+ctoken ile Non3D. CVV istenen
 *   kartlar sessizce çekilemez (require_cvv=1 → açık hata).
 * - Tarayıcı dönüşü (merchant_ok/fail_url) ödeme kanıtı DEĞİLDİR; hakikat
 *   Bildirim URL callback'i + durum sorgusudur.
 * - Önkoşullar ayrı ayrı kapı: Direct API + kart saklama + Non3D yetkileri
 *   PayTR tarafında onaylanmadan ilgili işlem açılmaz (fail-closed).
 * - SANDBOX'A KARŞI HENÜZ ÇALIŞTIRILMADI: merchant bilgileri owner'da.
 *
 * Tutar formatları (endpoint bazında, dokümandan):
 * - İstek payment_amount: MAJOR ondalık string ("100.99").
 * - Callback payment_amount/total_amount: ×100 tamsayı string ("3456").
 * - Para birimi: istekte TL/EUR/USD (TRY değil TL); callback'te TL/EUR/USD/GBP/RUB.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SaasCurrency } from "./types";
import { CURRENCY_MINOR_EXPONENT } from "./types";

export const PAYTR_BASE_URL = "https://www.paytr.com";
const CHARGE_PATH = "/odeme";
const CAPI_LIST_PATH = "/odeme/capi/list";
const STATUS_QUERY_PATH = "/odeme/durum-sorgu";

export type PaytrConfig = {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  /** "1" test, "0" canlı. Varsayılan test (fail-safe). */
  testMode: "1" | "0";
  baseUrl: string;
  /** Hesap yetkileri (PayTR onayından sonra owner "true" yapar). */
  capDirect: boolean;
  capCardStorage: boolean;
  capNon3d: boolean;
};

const flag = (v: string | undefined) => (v || "").toLowerCase() === "true";

export function getPaytrConfig(): PaytrConfig {
  return {
    merchantId: process.env.PAYTR_MERCHANT_ID || "",
    merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
    testMode: process.env.PAYTR_TEST_MODE === "0" ? "0" : "1",
    baseUrl: process.env.PAYTR_BASE_URL || PAYTR_BASE_URL,
    capDirect: flag(process.env.PAYTR_CAP_DIRECT),
    capCardStorage: flag(process.env.PAYTR_CAP_CARD_STORAGE),
    capNon3d: flag(process.env.PAYTR_CAP_NON3D),
  };
}

export function paytrMissingPreconditions(): string[] {
  const c = getPaytrConfig();
  const missing: string[] = [];
  if (!c.merchantId || !c.merchantKey || !c.merchantSalt) {
    missing.push("PayTR merchant bilgileri (merchant_id/key/salt) tanımlı değil.");
  }
  if (!c.capDirect) missing.push("PayTR Direct API yetkisi onaylanmadı (PAYTR_CAP_DIRECT).");
  if (!c.capCardStorage) missing.push("PayTR kart saklama yetkisi onaylanmadı (PAYTR_CAP_CARD_STORAGE).");
  if (!c.capNon3d) missing.push("PayTR Non3D/otomatik tahsilat yetkisi onaylanmadı (PAYTR_CAP_NON3D).");
  return missing;
}

export function isPaytrConfigured(): boolean {
  return paytrMissingPreconditions().length === 0;
}

/** Yalnız kart kaydı akışı için önkoşul (Non3D gerekmez). */
export function paytrCardRegisterPreconditions(): string[] {
  return paytrMissingPreconditions().filter((m) => !m.includes("Non3D"));
}

// ───────────── Tutar / para birimi dönüşümleri ─────────────

export function paytrCurrencyFor(currency: SaasCurrency): "TL" | "USD" {
  if (currency === "TRY") return "TL";
  if (currency === "USD") return "USD";
  throw new Error(`PayTR bu para birimini desteklemiyor: ${currency}`);
}

/** Minor → "100.99" (major, nokta ondalık, 2 basamak). */
export function minorToPaytrAmount(amountMinor: number, currency: SaasCurrency): string {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("PayTR tutarı pozitif tamsayı minor-unit olmalı.");
  }
  const exp = CURRENCY_MINOR_EXPONENT[currency];
  const major = Math.floor(amountMinor / 10 ** exp);
  const rest = amountMinor % 10 ** exp;
  return `${major}.${rest.toString().padStart(exp, "0")}`;
}

/** Callback ×100 string → minor. Biçim dışıysa hata (körlemesine parse yok). */
export function paytrCallbackAmountToMinor(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error("PayTR callback tutar biçimi geçersiz.");
  const v = Number(raw);
  if (!Number.isSafeInteger(v) || v <= 0) throw new Error("PayTR callback tutarı geçersiz.");
  return v;
}

// ───────────── Token matematiği ─────────────

function b64hmac(key: string, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("base64");
}

/** Ödeme isteği token'ı: base64(HMAC(key, hash_str+salt)). */
export function paytrRequestToken(args: {
  merchantKey: string;
  merchantSalt: string;
  merchantId: string;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: string;
  paymentType: string;
  installmentCount: string;
  currency: string;
  testMode: string;
  non3d: string;
}): string {
  const hashStr =
    args.merchantId +
    args.userIp +
    args.merchantOid +
    args.email +
    args.paymentAmount +
    args.paymentType +
    args.installmentCount +
    args.currency +
    args.testMode +
    args.non3d;
  return b64hmac(args.merchantKey, hashStr + args.merchantSalt);
}

/** Callback hash'i: base64(HMAC(key, oid+salt+status+total)). */
export function paytrCallbackHash(args: {
  merchantKey: string;
  merchantSalt: string;
  merchantOid: string;
  status: string;
  totalAmount: string;
}): string {
  return b64hmac(args.merchantKey, args.merchantOid + args.merchantSalt + args.status + args.totalAmount);
}

export function paytrStatusQueryToken(args: {
  merchantKey: string;
  merchantSalt: string;
  merchantId: string;
  merchantOid: string;
}): string {
  return b64hmac(args.merchantKey, args.merchantId + args.merchantOid + args.merchantSalt);
}

export function paytrCapiListToken(args: {
  merchantKey: string;
  merchantSalt: string;
  utoken: string;
}): string {
  return b64hmac(args.merchantKey, args.utoken + args.merchantSalt);
}

/** merchant_oid: ≤64, [A-Za-z0-9] güvenli alfabe. */
export function newPaytrMerchantOid(prefix = "NVII"): string {
  const t = Date.now().toString(36);
  const r = randomBytes(6).toString("hex");
  return `${prefix}${t}${r}`.slice(0, 64);
}

export function isSafeMerchantOid(v: string): boolean {
  return /^[A-Za-z0-9]{1,64}$/.test(v);
}

// ───────────── İlk kart kaydı formu (kart sunucuya uğramaz) ─────────────

export type PaytrCardRegisterForm = {
  postUrl: string;
  /** Gizli alanlar — kart alanları istemcide BOŞ render edilir. */
  fields: Record<string, string>;
  merchantOid: string;
};

export function buildPaytrCardRegisterForm(args: {
  merchantOid: string;
  email: string;
  userIp: string;
  amountMinor: number;
  currency: SaasCurrency;
  /** Mevcut kullanıcı token'ı (kart ekleme) — yoksa ilk kayıt. */
  utoken?: string;
  okUrl: string;
  failUrl: string;
  lang?: "tr" | "en";
}): PaytrCardRegisterForm {
  const cfg = getPaytrConfig();
  if (!isSafeMerchantOid(args.merchantOid)) throw new Error("Geçersiz merchant_oid.");
  const paymentAmount = minorToPaytrAmount(args.amountMinor, args.currency);
  const currency = paytrCurrencyFor(args.currency);
  const token = paytrRequestToken({
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
    merchantId: cfg.merchantId,
    userIp: args.userIp,
    merchantOid: args.merchantOid,
    email: args.email,
    paymentAmount,
    paymentType: "card",
    installmentCount: "0",
    currency,
    testMode: cfg.testMode,
    non3d: "0",
  });
  const fields: Record<string, string> = {
    merchant_id: cfg.merchantId,
    user_ip: args.userIp,
    merchant_oid: args.merchantOid,
    email: args.email,
    payment_amount: paymentAmount,
    payment_type: "card",
    installment_count: "0",
    currency,
    test_mode: cfg.testMode,
    non_3d: "0",
    merchant_ok_url: args.okUrl,
    merchant_fail_url: args.failUrl,
    client_lang: args.lang ?? "tr",
    paytr_token: token,
    store_card: "1",
  };
  if (args.utoken) fields.utoken = args.utoken;
  return { postUrl: `${cfg.baseUrl}${CHARGE_PATH}`, fields, merchantOid: args.merchantOid };
}

// ───────────── Callback doğrulama ─────────────

export type PaytrCallbackData = {
  merchantOid: string;
  status: "success" | "failed";
  totalAmountMinor: number;
  paymentAmountMinor: number | null;
  currency: string;
  paymentType: string;
  installmentCount: string;
  testMode: string;
  /** Kart saklama yanıtları (varsa) — yokluğu hata değil. */
  utoken: string | null;
  ctoken: string | null;
};

export function verifyPaytrCallback(
  form: Record<string, string>
): { ok: true; data: PaytrCallbackData } | { ok: false; error: string } {
  const cfg = getPaytrConfig();
  if (!cfg.merchantId || !cfg.merchantKey || !cfg.merchantSalt) {
    return { ok: false, error: "PayTR merchant bilgileri yapılandırılmadı." };
  }
  const merchantOid = (form.merchant_oid || "").trim();
  const status = (form.status || "").trim();
  const totalAmount = (form.total_amount || "").trim();
  const hash = (form.hash || "").trim();
  if (!merchantOid || (status !== "success" && status !== "failed") || !totalAmount || !hash) {
    return { ok: false, error: "PayTR callback alanları eksik." };
  }
  const expected = paytrCallbackHash({
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
    merchantOid,
    status,
    totalAmount,
  });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "PayTR callback imzası geçersiz." };
  }
  let totalMinor: number;
  try {
    totalMinor = paytrCallbackAmountToMinor(totalAmount);
  } catch {
    return { ok: false, error: "PayTR callback tutarı geçersiz." };
  }
  let paymentMinor: number | null = null;
  if (form.payment_amount) {
    try {
      paymentMinor = paytrCallbackAmountToMinor(form.payment_amount.trim());
    } catch {
      return { ok: false, error: "PayTR callback sipariş tutarı geçersiz." };
    }
  }
  return {
    ok: true,
    data: {
      merchantOid,
      status,
      totalAmountMinor: totalMinor,
      paymentAmountMinor: paymentMinor,
      currency: (form.currency || "").trim(),
      paymentType: (form.payment_type || "").trim(),
      installmentCount: (form.installment_count || "").trim(),
      testMode: (form.test_mode || "").trim(),
      utoken: (form.utoken || "").trim() || null,
      ctoken: (form.ctoken || "").trim() || null,
    },
  };
}

// ───────────── Server-to-server çağrılar ─────────────

type PaytrApiResult<T> = { ok: true; data: T } | { ok: false; error: string; errorCode: string };

async function paytrFormPost<T>(
  path: string,
  params: Record<string, string>,
  timeoutMs = 15000
): Promise<PaytrApiResult<T>> {
  const cfg = getPaytrConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    return { ok: true, data: json as T };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "PayTR zaman aşımı." : e instanceof Error ? e.message : "PayTR bağlantı hatası.",
      errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

export type PaytrRecurringOutcome =
  | { outcome: "success" }
  | { outcome: "wait_callback" }
  | { outcome: "failed"; reason: string; retryable: boolean };

/**
 * Kayıtlı kartla tekrarlayan tahsilat (Non3D, server-to-server).
 * Doküman: failed + try_again → tekrar denenebilir; "devam eden işlem" özel durumu.
 */
export async function paytrRecurringCharge(args: {
  merchantOid: string;
  email: string;
  userIp: string;
  amountMinor: number;
  currency: SaasCurrency;
  utoken: string;
  ctoken: string;
}): Promise<PaytrApiResult<PaytrRecurringOutcome>> {
  const cfg = getPaytrConfig();
  const paymentAmount = minorToPaytrAmount(args.amountMinor, args.currency);
  const currency = paytrCurrencyFor(args.currency);
  const token = paytrRequestToken({
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
    merchantId: cfg.merchantId,
    userIp: args.userIp,
    merchantOid: args.merchantOid,
    email: args.email,
    paymentAmount,
    paymentType: "card",
    installmentCount: "0",
    currency,
    testMode: cfg.testMode,
    non3d: "1",
  });
  const res = await paytrFormPost<{
    status?: string;
    reason?: string;
    err_msg?: string;
    try_again?: number;
  }>(CHARGE_PATH, {
    merchant_id: cfg.merchantId,
    user_ip: args.userIp,
    merchant_oid: args.merchantOid,
    email: args.email,
    payment_amount: paymentAmount,
    payment_type: "card",
    installment_count: "0",
    currency,
    test_mode: cfg.testMode,
    non_3d: "1",
    recurring_payment: "1",
    utoken: args.utoken,
    ctoken: args.ctoken,
    paytr_token: token,
  });
  if (!res.ok) return res;
  const status = String(res.data.status || "");
  if (status === "success") return { ok: true, data: { outcome: "success" } };
  if (status === "wait_callback" || status === "wait") {
    return { ok: true, data: { outcome: "wait_callback" } };
  }
  const reason = String(res.data.reason || res.data.err_msg || "PayTR tahsilatı başarısız.");
  // Doküman kuralı: try_again varsa tekrar denenebilir; "devam eden işlem" istisna.
  const retryable = res.data.try_again === 1 && !/devam eden bir işlem/i.test(reason);
  return { ok: true, data: { outcome: "failed", reason, retryable } };
}

export type PaytrStoredCard = { ctoken: string; requireCvv: boolean };

/**
 * CAPI LIST — utoken ile kayıtlı kartlar. Yanıt şekli savunmacı parse edilir;
 * sandbox'ta doğrulanacak.
 */
export async function paytrListCards(
  utoken: string
): Promise<PaytrApiResult<PaytrStoredCard[]>> {
  const cfg = getPaytrConfig();
  const res = await paytrFormPost<{
    status?: string;
    err_msg?: string;
    cards?: Array<{ ctoken?: unknown; require_cvv?: unknown }>;
  }>(CAPI_LIST_PATH, {
    merchant_id: cfg.merchantId,
    utoken,
    paytr_token: paytrCapiListToken({
      merchantKey: cfg.merchantKey,
      merchantSalt: cfg.merchantSalt,
      utoken,
    }),
  });
  if (!res.ok) return res;
  if (res.data.status !== "success" || !Array.isArray(res.data.cards)) {
    return { ok: false, error: String(res.data.err_msg || "PayTR kart listesi alınamadı."), errorCode: "CAPI_LIST_FAILED" };
  }
  const cards: PaytrStoredCard[] = [];
  for (const c of res.data.cards) {
    if (typeof c?.ctoken === "string" && c.ctoken.length >= 4) {
      cards.push({ ctoken: c.ctoken, requireCvv: String(c.require_cvv ?? "0") === "1" });
    }
  }
  return { ok: true, data: cards };
}

export type PaytrStatusQuery =
  | { found: true; status: "success" | "failed"; totalAmountMinor: number | null }
  | { found: false; reason: string };

/** Durum sorgu — timeout/belirsiz sonuçlarda kör retry'den ÖNCE uzlaştırma. */
export async function paytrQueryStatus(
  merchantOid: string
): Promise<PaytrApiResult<PaytrStatusQuery>> {
  const cfg = getPaytrConfig();
  const res = await paytrFormPost<{
    status?: string;
    err_msg?: string;
    total_amount?: unknown;
  }>(STATUS_QUERY_PATH, {
    merchant_id: cfg.merchantId,
    merchant_oid: merchantOid,
    paytr_token: paytrStatusQueryToken({
      merchantKey: cfg.merchantKey,
      merchantSalt: cfg.merchantSalt,
      merchantId: cfg.merchantId,
      merchantOid,
    }),
  });
  if (!res.ok) return res;
  const status = String(res.data.status || "");
  if (status === "success" || status === "failed") {
    let total: number | null = null;
    if (typeof res.data.total_amount === "string" && /^\d+$/.test(res.data.total_amount)) {
      total = Number(res.data.total_amount);
    }
    return { ok: true, data: { found: true, status, totalAmountMinor: total } };
  }
  return { ok: true, data: { found: false, reason: String(res.data.err_msg || "İşlem bulunamadı.") } };
}
