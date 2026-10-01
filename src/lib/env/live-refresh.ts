/**
 * Portal "canlı" program yenilemesinin aralığı (ProgramLiveRefresh). Production'da ürün davranışı
 * aynen: 45 sn. Test/önizleme/yerel ortamlarda 5 dk — açık bırakılan UAT sekmeleri Supabase DB
 * egress kotasını tüketmesin (her yenileme bir tam sayfa render'ıdır). Sekmeye dönünce yenileme
 * her ortamda sürer. `NEVII_LIVE_REFRESH_MS` ile ortam bazında ezilebilir (0 = yalnız sekmeye dönünce).
 * Katman kuralı `robots-policy.ts` ile aynı: tier yoksa yalnız Vercel production'ı production sayılır.
 */
export const PRODUCTION_LIVE_REFRESH_MS = 45_000;
export const NON_PRODUCTION_LIVE_REFRESH_MS = 5 * 60_000;

export function liveRefreshIntervalMs(env: Record<string, string | undefined> = process.env): number {
  const override = env.NEVII_LIVE_REFRESH_MS?.trim();
  if (override && /^\d+$/.test(override)) return Number(override);
  const tier = (env.NEVII_DEPLOYMENT_TIER ?? "").trim().toLowerCase();
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  const production = tier === "production" || (tier !== "review" && tier !== "test" && vercelEnv === "production");
  return production ? PRODUCTION_LIVE_REFRESH_MS : NON_PRODUCTION_LIVE_REFRESH_MS;
}
