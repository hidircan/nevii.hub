/**
 * Test ortamı hedef guard'ı — fail-closed.
 *
 * NEDEN: production Supabase (`uqkafczrplqitzumtrqy`) ile test Supabase
 * (`vxzewyiwfshobjizzetw`) aynı hesapta, aynı organizasyonda ve connection
 * string'leri neredeyse aynı şekilde. Yanlış `DATABASE_URL` ile çalıştırılan
 * TEK bir `prisma migrate deploy` / demo seed komutu production veritabanına
 * yazar. Bu modül, test amaçlı her komutun ÖNCE hedefini sınıflandırmasını ve
 * hedef kesin olarak "test" değilse DURMASINI sağlar.
 *
 * GİZLİLİK KURALI: buradaki hiçbir fonksiyon connection string'i, parolayı,
 * kullanıcı adını, tam host'u, project ref'i veya query string'i DÖNDÜRMEZ ve
 * LOGLAMAZ. Dışarı yalnız sınıflandırma + host son eki + port çıkar.
 */

/** Bilinen Supabase projeleri. Env ile override edilebilir (CI/başka hesap). */
export const PRODUCTION_SUPABASE_REF = process.env.PROD_SUPABASE_REF || "uqkafczrplqitzumtrqy";
export const TEST_SUPABASE_REF = process.env.TEST_SUPABASE_REF || "vxzewyiwfshobjizzetw";

export type TargetClassification =
  | "missing" // DATABASE_URL hiç yok
  | "unparseable" // URL olarak ayrıştırılamadı
  | "local" // localhost / 127.0.0.1
  | "test" // test Supabase project ref'i
  | "production" // production Supabase project ref'i
  | "unknown"; // başka bir host — güvenli varsayım yapılmaz

export type PoolerMode = "transaction" | "session-or-direct" | "unknown";

export type TargetInfo = {
  classification: TargetClassification;
  /** Yalnız son ek, ör. "*.pooler.supabase.com" — tam host ASLA. */
  hostSuffix: string;
  port: number | null;
  poolerMode: PoolerMode;
  /** İnsan tarafından okunabilir, secret İÇERMEYEN tek satırlık özet. */
  safeLabel: string;
};

/**
 * Supabase project ref'ini connection string'den çıkarır.
 * İki biçim var:
 *   - doğrudan host:  db.<ref>.supabase.co
 *   - pooler:         kullanıcı adı `postgres.<ref>`, host aws-N-<region>.pooler.supabase.com
 */
function extractSupabaseRef(url: URL): string | null {
  const directHost = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (directHost) return directHost[1].toLowerCase();

  if (url.hostname.endsWith(".pooler.supabase.com")) {
    const user = decodeURIComponent(url.username || "");
    const dotted = /^postgres\.([a-z0-9]+)$/i.exec(user);
    if (dotted) return dotted[1].toLowerCase();
  }
  return null;
}

/** Tam host yerine güvenli son ek üretir. */
function safeHostSuffix(hostname: string): string {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return hostname;
  if (hostname.endsWith(".pooler.supabase.com")) return "*.pooler.supabase.com";
  if (hostname.endsWith(".supabase.co")) return "*.supabase.co";
  const parts = hostname.split(".");
  return parts.length >= 2 ? `*.${parts.slice(-2).join(".")}` : "***";
}

function poolerModeOf(port: number | null, url: URL): PoolerMode {
  if (port === 6543) return "transaction";
  if (url.searchParams.get("pgbouncer") === "true") return "transaction";
  if (port === 5432) return "session-or-direct";
  return "unknown";
}

/**
 * Bir connection string'i secret sızdırmadan sınıflandırır.
 * Belirsiz her durum "unknown" döner — çağıran taraf fail-closed davranır.
 */
export function classifyDatabaseTarget(rawUrl: string | undefined | null): TargetInfo {
  const value = (rawUrl ?? "").trim();
  if (!value) {
    return {
      classification: "missing",
      hostSuffix: "-",
      port: null,
      poolerMode: "unknown",
      safeLabel: "DATABASE_URL tanımlı değil",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      classification: "unparseable",
      hostSuffix: "-",
      port: null,
      poolerMode: "unknown",
      safeLabel: "DATABASE_URL ayrıştırılamadı (geçerli bir URL değil)",
    };
  }

  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    return {
      classification: "unparseable",
      hostSuffix: safeHostSuffix(url.hostname),
      port: null,
      poolerMode: "unknown",
      safeLabel: `DATABASE_URL postgresql:// değil (protokol=${url.protocol})`,
    };
  }

  const port = url.port ? Number(url.port) : 5432;
  const hostSuffix = safeHostSuffix(url.hostname);
  const poolerMode = poolerModeOf(port, url);
  const ref = extractSupabaseRef(url);

  let classification: TargetClassification;
  if (ref === PRODUCTION_SUPABASE_REF) classification = "production";
  else if (ref === TEST_SUPABASE_REF) classification = "test";
  else if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) classification = "local";
  else classification = "unknown";

  return {
    classification,
    hostSuffix,
    port,
    poolerMode,
    safeLabel: `hedef=${classification} host=${hostSuffix} port=${port} pooler=${poolerMode}`,
  };
}

export class TargetGuardError extends Error {
  readonly info: TargetInfo | null;
  constructor(message: string, info: TargetInfo | null = null) {
    super(message);
    this.name = "TargetGuardError";
    this.info = info;
  }
}

/**
 * Hedefin TEST Supabase projesi olduğunu doğrular. Test dışı her sonuç
 * (production, local, unknown, missing, unparseable) hata fırlatır.
 */
export function assertTestDatabaseTarget(rawUrl: string | undefined | null): TargetInfo {
  const info = classifyDatabaseTarget(rawUrl);
  if (info.classification === "production") {
    throw new TargetGuardError(
      "REDDEDİLDİ: DATABASE_URL PRODUCTION Supabase projesini gösteriyor. " +
        "Test migration/seed komutları production'a ASLA çalıştırılmaz.",
      info
    );
  }
  if (info.classification !== "test") {
    throw new TargetGuardError(
      `REDDEDİLDİ: hedef test Supabase projesi olarak doğrulanamadı (${info.safeLabel}). ` +
        "Fail-closed: belirsiz hedefte hiçbir şey çalıştırılmaz.",
      info
    );
  }
  return info;
}

/**
 * `prisma migrate` için ek koşul: transaction-mode pooler (6543/pgbouncer)
 * üzerinde migrate komutları SESSİZCE ASILI KALIR (bkz. LESSONS_LEARNED
 * 2026-09-05). Session pooler (5432) veya doğrudan bağlantı şart.
 */
export function assertMigrationSafeConnection(rawUrl: string | undefined | null): TargetInfo {
  const info = assertTestDatabaseTarget(rawUrl);
  if (info.poolerMode !== "session-or-direct") {
    throw new TargetGuardError(
      `REDDEDİLDİ: migration için transaction-mode pooler kullanılamaz (${info.safeLabel}). ` +
        "Session pooler'ı (port 5432) veya doğrudan bağlantıyı kullanın — 6543/pgbouncer=true " +
        "üzerinde `prisma migrate` hata vermeden sonsuza kadar asılı kalır.",
      info
    );
  }
  return info;
}

/** Production runtime'da (Vercel prod veya NODE_ENV=production) koşulsuz durur. */
export function assertNotProductionRuntime(): void {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new TargetGuardError(
      "REDDEDİLDİ: bu komut PRODUCTION ortamında çalıştırılamaz " +
        "(NODE_ENV veya VERCEL_ENV = production)."
    );
  }
}

/**
 * DB'ye yazan komutlar için STORE_MODE=db şartı. STORE_MODE=json/memory iken
 * migration/seed çalıştırmak sessizce yanlış hedefe (dosya/bellek) yazar.
 */
export function assertDbStoreMode(): void {
  const mode = (process.env.STORE_MODE ?? "json").toLowerCase();
  if (mode !== "db") {
    throw new TargetGuardError(
      `REDDEDİLDİ: STORE_MODE=${mode}. Veritabanı migration/seed komutları yalnız ` +
        "STORE_MODE=db altında anlamlıdır; aksi halde dosya/bellek store'una yazılır."
    );
  }
}

/** Eksik env değişkenlerinin İSİMLERİNİ döner — değerleri asla okumaz/yazmaz. */
export function missingEnvNames(names: readonly string[]): string[] {
  return names.filter((name) => !(process.env[name] ?? "").trim());
}

/** Test ortamının çalışması için zorunlu env değişkenleri. */
export const REQUIRED_TEST_ENV = [
  "STORE_MODE",
  "DATABASE_URL",
  "JWT_SECRET",
  "APP_BASE_URL",
] as const;

/**
 * Production'a ait olduğu bilinen değerlerin test ortamına sızmadığını
 * kontrol eder. Yalnız HOST/ORIGIN karşılaştırır, secret okumaz.
 */
export function productionLeakWarnings(): string[] {
  const warnings: string[] = [];
  const appBase = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim();
  if (appBase && !/^https?:\/\/(test\.|localhost|127\.0\.0\.1)/i.test(appBase)) {
    warnings.push(
      "APP_BASE_URL test domain'i (test.neviihub.com) veya localhost değil — " +
        "davet/şifre linkleri yanlış ortama gider."
    );
  }
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    warnings.push("NEXT_PUBLIC_SUPABASE_URL PRODUCTION Supabase projesini gösteriyor.");
  }
  return warnings;
}
