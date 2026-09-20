/**
 * STORE_MODE:
 * - json  → local file (./data) veya Vercel'de /tmp (demo)
 * - db    → Prisma MySQL/MariaDB (production kalıcı)
 * - memory → process memory (serverless demo, cold start'ta seed)
 */
const mode = (process.env.STORE_MODE ?? "json").toLowerCase();

export const STORE_MODE: "json" | "db" | "memory" =
  mode === "db" ? "db" : mode === "memory" ? "memory" : "json";

export const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER ?? "mysql";
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const isDbMode = STORE_MODE === "db";
export const isMemoryMode = STORE_MODE === "memory";

/** Vercel serverless'da kalıcı disk yok → /tmp veya memory kullan */
export function resolveDataDir(defaultDir: string) {
  /**
   * 2026-09-20 — AÇIK İZOLASYON KAPISI. `json`/`memory` modundaki dosya
   * deposu tüm süreçler arasında PAYLAŞILIR (`/tmp/notaplan-data`) ve her
   * test dosyası `beforeEach`'te `store.json`u SİLER. Aynı makinede iki
   * koşu (ör. iki git worktree'sinde `npm test`) birbirinin verisini
   * siler; sonuç kodla hiç ilgisi olmayan, her koşuda DEĞİŞEN sahte
   * hatalardır (bkz. LESSONS_LEARNED 2026-09-20).
   *
   * `NOTAPLAN_DATA_DIR` verildiğinde o dizin kullanılır — böylece paralel
   * koşular birbirini görmeden çalışabilir:
   *   NOTAPLAN_DATA_DIR=$(mktemp -d) npm test
   *
   * Üretim davranışı DEĞİŞMEZ: değişken tanımlı değilse serverless'ta yine
   * `/tmp/notaplan-data`, yerelde yine `defaultDir` döner.
   */
  const explicit = process.env.NOTAPLAN_DATA_DIR?.trim();
  if (explicit) return explicit;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return "/tmp/notaplan-data";
  }
  return defaultDir;
}

/**
 * UAT kararı (2026-09-07) — "Demo verisini sıfırla" gibi YIKICI geliştirici
 * araçları hiçbir test/preview/production kullanıcısına açılmaz; yalnız
 * yerel geliştirmede vardır. Test verisi reseti artık bir ops prosedürüdür
 * (bkz. docs/performance/ADMIN_WEB_P0_BASELINE.md → "Demo reset").
 *
 * `NODE_ENV !== "production"` TEK BAŞINA YETMEZ: Vercel Preview build'leri de
 * `NODE_ENV=production` ile çalışır ama asıl ayırt edici, Vercel'in her
 * dağıtımda tanımladığı `VERCEL` değişkenidir. İkisi birlikte fail-closed
 * davranır — değişkenler hiç okunamazsa sonuç `false` (araç KAPALI) olur.
 */
export function isLocalDevTooling(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}
