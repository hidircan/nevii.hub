import { consumeRateLimit } from "../rate-limit";
import { jsonFail } from "./http";

/**
 * Per-authenticated-user rate limit for an API route. Returns a 429 NextResponse
 * if the caller is over budget, or null to continue. Keyed by userId (not IP) —
 * these routes require auth, and many users can share an IP (school network).
 */
export function enforceUserRateLimit(
  bucket: string,
  userId: string,
  opts: { windowMs: number; max: number }
) {
  if (consumeRateLimit(bucket, userId, opts)) return null;
  const res = jsonFail("RATE_LIMITED", "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.");
  res.headers.set("Retry-After", String(Math.ceil(opts.windowMs / 1000)));
  return res;
}
