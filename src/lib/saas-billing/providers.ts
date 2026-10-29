/**
 * Sağlayıcı kayıt defteri + capability modeli.
 *
 * Kurallar:
 * - Domain (abonelik/dönem/kullanım hakkı) sağlayıcıdan bağımsızdır ve
 *   uygulamanın kendi kimlikleriyle yönetilir.
 * - Her abonelik kendi sağlayıcısını taşır; global varsayılan YALNIZCA YENİ
 *   abonelikler içindir ve eskileri sessizce taşımaz.
 * - Eski işlemlerin callback/sorgu/iadeleri, kayıttaki sağlayıcıya gider.
 * - Sağlayıcının desteklemediği özellik taklit edilmez: capability yoksa
 *   açık UNSUPPORTED hatası döner.
 */
import type {
  SaasExecutionModel,
  SaasProviderId,
  SaasSubscriptionStatus,
} from "./types";

export type ProviderCapability =
  | "embed_checkout_html"
  | "form_post_checkout"
  | "retrieve_by_token"
  | "status_query"
  | "server_charge"
  | "provider_renewal"
  | "card_update_form"
  | "remote_cancel";

export function hasCapability(
  provider: { capabilities: readonly ProviderCapability[] },
  cap: ProviderCapability
): boolean {
  return provider.capabilities.includes(cap);
}

export function unsupportedError(provider: string, op: string): { ok: false; error: string; errorCode: string } {
  return {
    ok: false,
    error: `${provider} bu işlemi desteklemiyor: ${op}.`,
    errorCode: "UNSUPPORTED",
  };
}

/** Merchant hesabı etiketi — her işlemde açıkça belli olur. */
export function merchantLabel(provider: SaasProviderId, accountId: string): string {
  if (provider === "manual") return "manual";
  if (provider === "mock") return "mock:test";
  if (provider === "none") return "";
  return `${provider}:${accountId || "unconfigured"}`;
}

export function isTerminalAttemptStatus(s: string): boolean {
  return s === "succeeded" || s === "failed" || s === "voided";
}

/** Belirsiz (timeout/bilinmeyen) sonuç — körlemesine retry YOK, önce uzlaştırma. */
export function isUncertainAttemptStatus(s: string): boolean {
  return s === "uncertain" || s === "pending";
}

/**
 * Canlı-tahsilat kilidi. Sandbox/test her zaman serbesttir; GERÇEK para
 * hareketi için hem açık owner bayrağı hem production ortamı gerekir.
 * Eksik/bilinmeyen konfigürasyon → güvenli kapalı.
 */
export function liveChargeGate(opts: {
  provider: string;
  /** true = gerçek para hareketi (PayTR test_mode=0, iyzico prod URL). */
  live: boolean;
}): { ok: true } | { ok: false; error: string; errorCode: string } {
  if (!opts.live) return { ok: true };
  const flag = (process.env.SAAS_BILLING_LIVE_CHARGES || "").toLowerCase() === "true";
  const prod = (process.env.VERCEL_ENV || "development") === "production";
  if (flag && prod) return { ok: true };
  return {
    ok: false,
    error:
      `Canlı tahsilat kilitli (${opts.provider}): gerçek para hareketi için ` +
      `SAAS_BILLING_LIVE_CHARGES=true + production ortamı gerekli (ayrı owner onayı).`,
    errorCode: "LIVE_LOCKED",
  };
}

export type { SaasExecutionModel, SaasProviderId, SaasSubscriptionStatus };
