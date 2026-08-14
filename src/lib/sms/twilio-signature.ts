import { createHmac, timingSafeEqual } from "crypto";

/** Twilio: HMAC-SHA1(url + sorted POST key+value) → base64. */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const key of keys) data += key + params[key];
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  if (!input.authToken || !input.signature) return false;
  const expected = computeTwilioSignature(input.authToken, input.url, input.params);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function resolveWebhookPublicUrl(request: Request): string {
  const configured = (process.env.SMS_WEBHOOK_PUBLIC_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}${url.pathname}`;
}
