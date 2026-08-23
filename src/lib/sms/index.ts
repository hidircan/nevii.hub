export type { SmsSendInput, SmsSendResult, SmsTransport, SmsDeliveryStatus, SmsInbound } from "./types";
export { getSmsConfig, getSmsProviderName, isSmsTestMode, isSmsProviderConfigured } from "./config";
export { getSmsTransport, setSmsTransportForTests } from "./transport";
export { normalizeToE164, maskE164, parseAllowlist } from "./e164";

import { createHash } from "crypto";
import { getSmsConfig, isSmsProviderConfigured, isSmsTestMode } from "./config";
import { normalizeToE164, parseAllowlist } from "./e164";
import { getSmsTransport } from "./transport";
import type { SmsSendResult } from "./types";

export class SmsPolicyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SmsPolicyError";
    this.code = code;
  }
}

export function estimateSmsSegments(body: string): { chars: number; segments: number; encoding: "gsm7" | "ucs2" } {
  const chars = [...body].length;
  const gsm7 = /^[\x00-\x7F€£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞ^{}\\[~\]|€]*$/.test(body);
  if (gsm7) {
    if (chars <= 160) return { chars, segments: chars === 0 ? 0 : 1, encoding: "gsm7" };
    return { chars, segments: Math.ceil(chars / 153), encoding: "gsm7" };
  }
  if (chars <= 70) return { chars, segments: chars === 0 ? 0 : 1, encoding: "ucs2" };
  return { chars, segments: Math.ceil(chars / 67), encoding: "ucs2" };
}

export function smsIdempotencyKey(tenantId: string, caseId: string, channel: string, body: string): string {
  return createHash("sha256").update(`${tenantId}|${caseId}|${channel}|${body}`).digest("hex");
}

export async function sendSmsGuarded(input: {
  to: string;
  body: string;
  allowUnconfigured?: boolean;
}): Promise<SmsSendResult> {
  const normalized = normalizeToE164(input.to);
  if (!normalized.ok) {
    throw new SmsPolicyError("VALIDATION_ERROR", normalized.message);
  }
  if (isSmsTestMode()) {
    const allow = parseAllowlist(getSmsConfig().allowlistRaw);
    if (!allow.has(normalized.e164)) {
      throw new SmsPolicyError("FORBIDDEN", "SMS test allowlist blocked");
    }
  }
  if (!isSmsProviderConfigured() && getSmsTransport().name === "console") {
    return { ok: false, error: "SMS sağlayıcısı yapılandırılmamış.", errorCode: "NOT_CONFIGURED" };
  }
  return getSmsTransport().send({ toE164: normalized.e164, body: input.body });
}

export function isSmsOptOutText(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t === "IPTAL" || t === "İPTAL" || t === "STOP" || t === "UNSUBSCRIBE" || t === "IPTAL ET";
}
