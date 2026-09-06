/**
 * Veritabanı bağlantı hatalarını GÜVENLİ bir sınıfa indirger.
 *
 * NEDEN: `/api/v1/ready` yalnız `reachable: false` döndürdüğü için, preview
 * ortamında bağlantının NEDEN düştüğü (yanlış parola mı, TLS mi, ağ mı)
 * görülemiyordu ve her tanı için deploy turu gerekiyordu.
 *
 * GİZLİLİK KURALI: burada ham hata mesajı, connection string, host, kullanıcı
 * adı, parola veya SQL DÖNMEZ. Çıktı, aşağıdaki KAPALI listeden tek bir
 * etikettir. Tanınmayan her şey `UNKNOWN`'dır — asla "biraz mesaj" sızdırılmaz.
 */

export const DB_ERROR_CLASSES = [
  "AUTHENTICATION",
  "NETWORK",
  "TLS",
  "POOLER",
  "PRISMA",
  "SCHEMA",
  "UNKNOWN",
] as const;

export type DbErrorClass = (typeof DB_ERROR_CLASSES)[number];

/** PostgreSQL SQLSTATE → sınıf (allowlist). */
const SQLSTATE: Record<string, DbErrorClass> = {
  "28000": "AUTHENTICATION", // invalid_authorization_specification
  "28P01": "AUTHENTICATION", // invalid_password
  "3D000": "SCHEMA", // invalid_catalog_name
  "42P01": "SCHEMA", // undefined_table
  "42703": "SCHEMA", // undefined_column
  "53300": "POOLER", // too_many_connections
  "08P01": "POOLER", // protocol_violation (pgbouncer/supavisor uyumsuzluğu)
  "26000": "POOLER", // invalid_sql_statement_name (transaction pooler + prepared statement)
  "42P05": "POOLER", // duplicate_prepared_statement
  "08006": "NETWORK", // connection_failure
  "08001": "NETWORK", // sqlclient_unable_to_establish_sqlconnection
  "57P01": "NETWORK", // admin_shutdown
};

/** Node soket/DNS errno kodları → NETWORK (allowlist). */
const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
]);

/** Node/OpenSSL sertifika doğrulama kodları → TLS (allowlist). */
const TLS_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "EPROTO",
]);

/** Prisma initialization/connection kodları → sınıf (allowlist). */
const PRISMA_CODES: Record<string, DbErrorClass> = {
  P1000: "AUTHENTICATION",
  P1001: "NETWORK",
  P1002: "NETWORK",
  P1003: "SCHEMA",
  P1010: "AUTHENTICATION",
  P1011: "TLS",
  P1017: "NETWORK",
  P2021: "SCHEMA",
  P2022: "SCHEMA",
};

/**
 * Kod taşımayan ama tek anlama gelen hatalar için KAPALI mesaj listesi.
 * Yalnız EŞLEŞME sonucu kullanılır; mesajın kendisi asla dışarı verilmez.
 */
const MESSAGE_ALLOWLIST: ReadonlyArray<readonly [string, DbErrorClass]> = [
  ["timeout exceeded when trying to connect", "NETWORK"],
  ["connection terminated due to connection timeout", "NETWORK"],
  ["max client connections reached", "POOLER"],
  ["prepared statement", "POOLER"],
  ["certificate", "TLS"],
  ["ssl", "TLS"],
];

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isPrismaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && name.startsWith("PrismaClient");
}

/** Hatayı kapalı listedeki tek bir etikete indirger. Asla fırlatmaz. */
export function classifyDbError(error: unknown): DbErrorClass {
  const code = codeOf(error);

  if (code) {
    if (PRISMA_CODES[code]) return PRISMA_CODES[code];
    if (SQLSTATE[code]) return SQLSTATE[code];
    if (NETWORK_CODES.has(code)) return "NETWORK";
    if (TLS_CODES.has(code)) return "TLS";
    // Bilinmeyen ama 5 karakterlik SQLSTATE → sınıf harfinden kaba eşleme.
    if (/^[0-9A-Z]{5}$/.test(code) && code.startsWith("28")) return "AUTHENTICATION";
  }

  const message =
    typeof error === "object" && error !== null && typeof (error as Error).message === "string"
      ? (error as Error).message.toLowerCase()
      : "";
  if (message) {
    for (const [needle, klass] of MESSAGE_ALLOWLIST) {
      if (message.includes(needle)) return klass;
    }
  }

  if (isPrismaError(error)) return "PRISMA";
  return "UNKNOWN";
}
