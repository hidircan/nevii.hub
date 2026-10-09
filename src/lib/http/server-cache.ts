/**
 * Best-effort sunucu tarafı TTL cache — pahalı, salt-okunur, tenant-kapsamlı
 * aggregate'ler için (admin özet, finans özeti, ödev raporu).
 *
 * Güvenlik/doğruluk sözleşmesi:
 * - Anahtar HER ZAMAN tenantId ile başlar (`tenantCacheKey` bunu zorlar);
 *   farklı kapsamlar asla aynı girdiyi paylaşmaz. Rol/user segmenti gereken
 *   yerde anahtara eklenir (bu dosyayı kullanan tool'un sorumluluğu).
 * - Cache YOKSA normal sorgu çalışır — doğruluk cache'e bağlı DEĞİLDİR
 *   (serverless instance belleğine güvenen tasarım YOK).
 * - Kısa TTL (30–60sn): özet ekranlarındaki sayılar için maddi fark yaratmaz;
 *   hiçbir ekranda "canlı/anlık" iddiası yoktur.
 * - Yalnız GET salt-okunur tool'lar kullanır; mutation sonrası invalidation
 *   gerekmez (TTL kısa + özet verisi).
 * - Eşzamanlı aynı-anahtar hesaplar tek uçuşta birleşir (stampede yok).
 */

const MAX_ENTRIES = 200;

type Entry = { expiresAt: number; value: unknown };

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

let hits = 0;
let misses = 0;

function evictIfNeeded(nowMs: number): void {
  if (entries.size < MAX_ENTRIES) return;
  for (const [k, e] of entries) {
    if (e.expiresAt <= nowMs) entries.delete(k);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}

function safeSegment(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

/**
 * Tenant-kapsamlı cache anahtarı. `tenantId` boş olamaz (fail-closed).
 * Ek segmentler (rol, filtre, tarih) kapsamı daraltır.
 */
export function tenantCacheKey(tenantId: string, ...segments: string[]): string {
  if (!tenantId || !tenantId.trim()) throw new Error("tenantCacheKey: tenantId zorunlu");
  return ["t", safeSegment(tenantId), ...segments.map(safeSegment)].join(":");
}

/** Test izolasyonu (üretimde kullanılmaz). Sayaçları da sıfırlar. */
export function __resetServerCache(): void {
  entries.clear();
  inFlight.clear();
  hits = 0;
  misses = 0;
}

/** PII içermez: yalnız sayaçlar (maliyet metriğine beslenir). */
export function serverCacheStats(): { hits: number; misses: number; size: number } {
  return { hits, misses, size: entries.size };
}

export async function serverCacheGetOrCompute<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
  nowMs: number = Date.now()
): Promise<{ value: T; cached: boolean }> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > nowMs) {
    // LRU dokunuşu: tekrar erişilen girdi sona alınır.
    entries.delete(key);
    entries.set(key, hit);
    hits += 1;
    return { value: hit.value as T, cached: true };
  }
  if (hit) entries.delete(key);

  const shared = inFlight.get(key);
  if (shared) {
    return { value: (await shared) as T, cached: true };
  }

  misses += 1;
  const started = compute();
  inFlight.set(key, started as Promise<unknown>);
  try {
    const value = await started;
    evictIfNeeded(nowMs);
    entries.set(key, { expiresAt: nowMs + Math.max(0, ttlMs), value });
    return { value, cached: false };
  } finally {
    if (inFlight.get(key) === started) inFlight.delete(key);
  }
}
