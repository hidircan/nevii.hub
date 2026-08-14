/**
 * CSRF / Origin defense-in-depth for cookie-authenticated mutating requests.
 *
 * Auth model (documented in SECURITY_REVIEW.md): the web panel authenticates via
 * an HttpOnly, SameSite=Lax cookie (src/lib/auth/cookies.ts) that the browser
 * attaches automatically to same-site requests — the classic CSRF-vulnerable
 * shape. SameSite=Lax already blocks cross-site POST/PUT/PATCH/DELETE cookie
 * attachment in every evergreen browser, but this Origin check is a second,
 * server-side layer that doesn't rely on browser SameSite enforcement (covers
 * legacy/misconfigured clients and any future switch to SameSite=None for a
 * separate frontend domain). Mobile/API clients authenticate via
 * `Authorization: Bearer` instead — those are never auto-attached by a browser,
 * so they carry no CSRF risk and are exempt from this check entirely.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Extra trusted web origins beyond the request's own host (e.g. a separate marketing/app split), comma-separated. */
function extraTrustedOrigins(): string[] {
  return (process.env.ALLOWED_WEB_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns true if the request should be rejected as a likely cross-site
 * forgery. Only ever call this for requests authenticated via cookie — Bearer
 * requests must not be passed here (see module doc).
 */
export function isCrossSiteMutation(request: Request): boolean {
  if (!MUTATING_METHODS.has(request.method)) return false;

  const selfOrigin = new URL(request.url).origin;
  const trusted = new Set([selfOrigin, ...extraTrustedOrigins()]);

  const origin = parseOrigin(request.headers.get("origin"));
  if (origin) return !trusted.has(origin);

  // No Origin header: modern browsers always send Origin on same-site POST/PUT/
  // PATCH/DELETE (not just cross-origin), so a cookie-authenticated mutating
  // request with neither Origin nor a same-origin Referer is not a normal
  // same-site browser call — fail closed rather than trust it.
  const refererOrigin = parseOrigin(request.headers.get("referer"));
  if (refererOrigin) return !trusted.has(refererOrigin);

  return true;
}
