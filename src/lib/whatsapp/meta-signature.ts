import { createHmac, timingSafeEqual } from "crypto";

/** Meta Cloud API: HMAC-SHA256(appSecret, rawBody) → hex, sent as `sha256=<hex>`. */
export function computeMetaSignature(appSecret: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyMetaSignature(input: {
  appSecret: string;
  rawBody: string;
  signatureHeader: string;
}): boolean {
  if (!input.appSecret || !input.signatureHeader) return false;
  const expected = computeMetaSignature(input.appSecret, input.rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
