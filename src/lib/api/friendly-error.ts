/**
 * Phase 7 token-error fix (2026-08-30) — API error responses carry the raw
 * `authenticateRequest` message (e.g. "Invalid or expired access token", see
 * src/lib/auth/authenticate.ts) which must never reach a normal user's screen
 * (leaks implementation detail, looks like a bug). Client components call this
 * to turn `{code, message}` into a canonical Turkish message; token text itself
 * is never surfaced, logged, or written into the DOM.
 */
export function friendlyApiErrorMessage(
  error: { code?: string; message?: string } | undefined,
  fallback: string
): string {
  if (error?.code === "UNAUTHORIZED") {
    return "Oturumunuz sona erdi. Lütfen yeniden giriş yapın.";
  }
  if (error?.code === "FORBIDDEN") {
    return "Bu işlem için yetkiniz yok.";
  }
  if (error?.code === "VALIDATION_ERROR" || error?.code === "CONFLICT" || error?.code === "NOT_FOUND") {
    return error.message || fallback;
  }
  return fallback;
}
