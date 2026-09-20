/**
 * Offline read-cache anahtar + politika katmanı (Faz 7) — saf, RN-bağımsız.
 *
 * Kural seti:
 * - YALNIZ allowlist'teki GET okumaları cache'lenir (ders programı, ödev,
 *   materyal metadata, devam, telafi, ödeme ledger/makbuz metadata, bildirim).
 * - Checkout/ödeme oturumu, token/secret, ham dosya baytı ASLA cache'lenmez
 *   (allowlist dışı = yazılmaz + okunmaz).
 * - Anahtar: sürüm + tenantId + userId + persona + studentId + yol-hash'i.
 *   Çocuk/kullanıcı/tenant değişiminde anahtar değişir — çapraz veri YOK.
 * - TTL sınıfı yola göre; süre dolunca "stale" gösterilir + arka-planda tazelenir.
 */

export const CACHE_VERSION = 1;

const MIN = 60_000;

export type CacheClass =
  | "notifications"
  | "schedule"
  | "homework"
  | "payments"
  | "makeup"
  | "attendance"
  | "reference";

export const CACHE_TTL_MS: Record<CacheClass, number> = {
  notifications: 5 * MIN,
  schedule: 15 * MIN,
  homework: 15 * MIN,
  payments: 15 * MIN,
  makeup: 15 * MIN,
  attendance: 30 * MIN,
  reference: 60 * MIN,
};

/** Cache'e YAZILMAYACAK desenler — güvenlik kritik (token/oturum/ödeme akışı). */
const DENY_PATTERNS: RegExp[] = [
  /checkout/i,
  /token/i,
  /session/i,
  /password/i,
  /photo/i,
  /\/api\/v1\/mobile\//,
  /\/api\/v1\/payments\/[^/]+\/pay/,
  /presign/i,
  /download/i,
];

/** Cache'e alınabilir okuma sınıfları (sıralı — ilk eşleşme kazanır). */
const ALLOW_RULES: Array<{ test: RegExp; cls: CacheClass }> = [
  { test: /\/api\/v1\/notifications(\?|$)/, cls: "notifications" },
  { test: /\/api\/v1\/students\/[^/]+\/schedule/, cls: "schedule" },
  { test: /\/api\/v1\/attendance-calendar\//, cls: "schedule" },
  { test: /\/api\/v1\/students\/[^/]+\/homework/, cls: "homework" },
  { test: /\/api\/v1\/homework\//, cls: "homework" },
  { test: /\/api\/v1\/students\/[^/]+\/(payment-ledger|balance)/, cls: "payments" },
  { test: /\/api\/v1\/payments\/[^/]+\/receipt/, cls: "payments" },
  { test: /\/api\/v1\/makeup(\?|$|\/)/, cls: "makeup" },
  { test: /\/api\/v1\/students\/[^/]+\/makeup-ledger/, cls: "makeup" },
  { test: /\/api\/v1\/students\/[^/]+\/(attendance-summary|attendance-ledger)/, cls: "attendance" },
  { test: /\/api\/v1\/students\/[^/]+\/(curriculum|teaching-materials|materials)/, cls: "reference" },
  // Çıplak profil (ad/şube başlıkları) — cache'li ekranların başlığı çevrimdışıyken de çizilir.
  { test: /\/api\/v1\/students\/[^/]+$/, cls: "reference" },
];

/** Yol cache'e uygun mu? Uygunsa sınıfı döner, değilse null. */
export function cacheClassForPath(path: string): CacheClass | null {
  if (!path) return null;
  for (const deny of DENY_PATTERNS) {
    if (deny.test(path)) return null;
  }
  for (const rule of ALLOW_RULES) {
    if (rule.test.test(path)) return rule.cls;
  }
  return null;
}

/** Kısa deterministik yol hash'i (FNV-1a, hex) — dosya adı için. */
export function hashPath(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type CacheKeyInput = {
  tenantId: string;
  userId: string;
  persona: string;
  studentId: string | null;
  path: string;
};

function safeSegment(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "_";
}

/** Deterministik dosya anahtarı (göreli yol). */
export function cacheFileKey(input: CacheKeyInput): string {
  return [
    `v${CACHE_VERSION}`,
    safeSegment(input.tenantId),
    safeSegment(input.userId),
    safeSegment(input.persona),
    safeSegment(input.studentId ?? "-"),
    `${hashPath(input.path)}.json`,
  ].join("/");
}

/** Kullanıcının tüm cache ad-alanı (logout temizliği için önek). */
export function cacheUserPrefix(tenantId: string, userId: string): string {
  return `v${CACHE_VERSION}/${safeSegment(tenantId)}/${safeSegment(userId)}/`;
}

export type CacheEntry<T = unknown> = {
  v: number;
  path: string;
  savedAt: string;
  data: T;
};

export function isEntryFresh<T>(entry: CacheEntry<T>, cls: CacheClass, nowMs: number): boolean {
  const saved = Date.parse(entry.savedAt);
  if (!Number.isFinite(saved)) return false;
  return nowMs - saved <= CACHE_TTL_MS[cls];
}
