/**
 * Auth config from env.
 * JWT_SECRET must be set in production; build/dev has a non-production fallback.
 */
export function getJwtSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "notaplan-dev-secret-change-me-in-production-32b");

  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is missing or too short (min 16 chars). Set it in environment variables."
    );
  }
  return new TextEncoder().encode(secret);
}

export const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || "15m";
export const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || "7d";

export const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || "tenant_nilufer_acar";

/**
 * NeviiHub platform kimliğinin bağlandığı sentetik tenant.
 * Bir müzik/sanat kurumu değildir; listTenants / kurum seçicide yer almaz.
 * HYPER_ADMIN JWT `tenantId` iddiası buradan gelir — kurum işlemlerinde
 * asla örtük hedef tenant sayılmaz; her cross-tenant işlem açık
 * `targetTenantId` ister.
 */
export const PLATFORM_TENANT_ID =
  process.env.PLATFORM_TENANT_ID || "tenant_platform";

/**
 * Non-production HYPER_ADMIN bootstrap. Must be a Zod-valid email
 * (`z.string().email()` on POST /api/v1/auth/login) — `*.localhost` is not.
 */
export const DEV_HYPER_ADMIN_EMAIL = "hyper@nevii-hub.test";
export const DEV_HYPER_ADMIN_PASSWORD = "demo-hyper-admin";
