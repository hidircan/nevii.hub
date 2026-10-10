/**
 * Mobil read-cache sayaçları — PII içermez, yalnız agregalar (hit/miss/stale/
 * yazma/temizleme). Bellek-içi, oturum ömründe; `__DEV__` özeti ve preflight
 * bütçe doğrulamasına beslenir. Ağ/tanı-telemetriye GÖNDERİLMEZ.
 */

export type CacheStats = {
  reads: number;
  hits: number;
  freshHits: number;
  staleHits: number;
  misses: number;
  writes: number;
  purges: number;
};

const stats: CacheStats = {
  reads: 0,
  hits: 0,
  freshHits: 0,
  staleHits: 0,
  misses: 0,
  writes: 0,
  purges: 0,
};

export function recordCacheRead(hit: boolean, fresh: boolean): void {
  stats.reads += 1;
  if (!hit) {
    stats.misses += 1;
    return;
  }
  stats.hits += 1;
  if (fresh) stats.freshHits += 1;
  else stats.staleHits += 1;
}

export function recordCacheWrite(): void {
  stats.writes += 1;
}

export function recordCachePurge(): void {
  stats.purges += 1;
}

export function getCacheStats(): CacheStats {
  return { ...stats };
}

/** Test izolasyonu (üretimde kullanılmaz). */
export function __resetCacheStats(): void {
  stats.reads = 0;
  stats.hits = 0;
  stats.freshHits = 0;
  stats.staleHits = 0;
  stats.misses = 0;
  stats.writes = 0;
  stats.purges = 0;
}
