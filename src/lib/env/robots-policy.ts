/**
 * Tier'a göre arama motoru politikası (NEVII_DEPLOYMENT_TIER).
 * next.config.ts `headers()` bunu X-Robots-Tag olarak runtime'a bağlar;
 * scripts/release/mobile-review-env.ts aynı fonksiyonu yeniden dışa aktarır.
 *
 * - review/test → her zaman noindex, nofollow.
 * - production → header yok (mevcut SEO aynen korunur).
 * - eksik/geçersiz tier → fail-closed noindex; TEK istisna Vercel'in kendi
 *   production deployment'ı (VERCEL_ENV=production): tier henüz tanımlanmamış
 *   production domain'i yanlışlıkla indeksten düşmesin.
 */
export function robotsPolicyForTier(
  tier: string | undefined,
  vercelEnv?: string,
): { index: boolean; follow: boolean; xRobotsTag: string | null } {
  const t = (tier ?? "").trim().toLowerCase();
  const indexable = t === "production" || (t !== "review" && t !== "test" && (vercelEnv ?? "").trim().toLowerCase() === "production");
  return indexable
    ? { index: true, follow: true, xRobotsTag: null }
    : { index: false, follow: false, xRobotsTag: "noindex, nofollow" };
}
