/**
 * Shared in-memory sliding-window rate limiter.
 *
 * ponytail: per-instance Map, not shared across serverless instances — acceptable
 * single-instance/dev-server floor per SECURITY_REVIEW.md; upgrade to a shared store
 * (Redis/Upstash) if/when running multi-instance production traffic.
 */
const buckets = new Map<string, Map<string, number[]>>();

export function consumeRateLimit(
  bucket: string,
  key: string,
  opts: { windowMs: number; max: number }
): boolean {
  let hits = buckets.get(bucket);
  if (!hits) {
    hits = new Map();
    buckets.set(bucket, hits);
  }
  const now = Date.now();
  const prev = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (prev.length >= opts.max) {
    hits.set(key, prev);
    return false;
  }
  prev.push(now);
  hits.set(key, prev);
  return true;
}

export function __resetRateLimitForTests(bucket?: string) {
  if (bucket) buckets.delete(bucket);
  else buckets.clear();
}
