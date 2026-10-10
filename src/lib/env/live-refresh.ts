/**
 * Portal "canlı" program yenilemesinin aralığı (ProgramLiveRefresh). Her yenileme bir TAM sayfa
 * render'ıdır (Vercel Active CPU + Supabase DB egress). 2026-10-01: production'daki 45 sn, açık bırakılan
 * tek bir öğretmen sekmesi için günde ~640 render demekti — Hobby planın aylık 4 saatlik Active CPU
 * kotasını tek başına zorlayabilir. Artık her ortamda 5 dk; sekmeye dönünce yenileme her ortamda sürer.
 * `NEVII_LIVE_REFRESH_MS` ile ortam bazında ezilebilir (0 = yalnız sekmeye dönünce).
 */
export const LIVE_REFRESH_MS = 5 * 60_000;

export function liveRefreshIntervalMs(env: Record<string, string | undefined> = process.env): number {
  const override = env.NEVII_LIVE_REFRESH_MS?.trim();
  return override && /^\d+$/.test(override) ? Number(override) : LIVE_REFRESH_MS;
}
