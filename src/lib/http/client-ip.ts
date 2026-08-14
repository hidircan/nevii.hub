/**
 * Best-effort client IP from proxy headers. Not trustworthy for authorization
 * decisions (spoofable), only as a rate-limit bucketing key — a spoofed IP just
 * means an attacker rate-limits themselves into a different bucket, not a bypass
 * of auth/tenant checks.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
