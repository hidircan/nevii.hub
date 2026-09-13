/**
 * Mobil review / test / production ortam ayrımı — saf doğrulama mantığı.
 *
 * NEDEN: production ve test Supabase aynı hesapta; review staging'in yanlış
 * DB'ye, test DB'nin gerçek production deployment'ına bağlanması tek bir env
 * hatasıyla olur. Bu modül env'i DEĞER YAZDIRMADAN sınıflandırır.
 *
 * GİZLİLİK: hiçbir çıktı satırı env değerini, tam host'u, project ref'i, query
 * string'i veya userinfo'yu içermez. URL'ler yalnız `protokol://*.son-ek`
 * biçiminde, DB yalnız `classifyDatabaseTarget().safeLabel` ile raporlanır.
 * `.env` dosyası OKUNMAZ — yalnız çağıranın verdiği env nesnesi (CI/Vercel).
 */
import { classifyDatabaseTarget, PRODUCTION_SUPABASE_REF, TEST_SUPABASE_REF } from "../../src/lib/env/test-target-guard";

export const TIERS = ["review", "test", "production"] as const;
export type Tier = (typeof TIERS)[number];

/** web = Vercel deploy, mobile = Expo Go / EAS preview, store = TestFlight / Internal Testing / App Review. */
export const TARGETS = ["web", "mobile", "store"] as const;
export type Target = (typeof TARGETS)[number];

export type Level = "ok" | "error" | "warn" | "manual";
export type Finding = { level: Level; message: string };
export type Env = Record<string, string | undefined>;

/** Gerçek müşteri domain'leri. NEVII_PRODUCTION_HOSTS (virgüllü) ile override edilir. */
export const DEFAULT_PRODUCTION_HOSTS = ["neviihub.com", "www.neviihub.com", "notaplan.vercel.app"];

type HostClass = "loopback" | "private" | "link-local" | "unspecified" | "internal" | "production" | "public";

function productionHosts(env: Env): string[] {
  const raw = (env.NEVII_PRODUCTION_HOSTS ?? "").trim();
  return raw ? raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean) : DEFAULT_PRODUCTION_HOSTS;
}

function classifyHost(hostname: string, prodHosts: string[]): HostClass {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || /^127\./.test(host)) return "loopback";
  if (host === "0.0.0.0" || host === "::") return "unspecified";
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return "private";
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return "private";
  if (/^169\.254\./.test(host) || /^fe80:/.test(host)) return "link-local";
  if (!host.includes(".") || /\.(local|internal|lan|home)$/.test(host)) return "internal";
  if (prodHosts.includes(host)) return "production";
  return "public";
}

/** Tam host yerine `*.son-iki-etiket`; IP'ler hiç yazılmaz. */
function redactedOrigin(url: URL): string {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const isIp = /^[\d.]+$/.test(host) || host.includes(":");
  const labels = host.split(".");
  const shown = isIp ? "<ip>" : labels.length > 2 ? `*.${labels.slice(-2).join(".")}` : host;
  return `${url.protocol}//${shown}`;
}

/**
 * Public HTTPS URL kontrolü. `expectProduction` true ise host production
 * listesinde OLMALI, false ise OLMAMALI.
 */
function checkPublicUrl(name: string, raw: string | undefined, env: Env, expectProduction: boolean): Finding[] {
  const value = (raw ?? "").trim();
  if (!value) return [{ level: "error", message: `${name} tanımlı değil — ortamın public HTTPS adresini ekleyin.` }];

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [{ level: "error", message: `${name} geçerli bir URL değil (malformed) — tam https://… adresi girin.` }];
  }

  const out: Finding[] = [];
  if (url.username || url.password) {
    out.push({ level: "error", message: `${name} kullanıcı adı/parola (userinfo) içeriyor — GÜVENSİZ; kimlik bilgisini URL'den kaldırın.` });
  }
  if (url.search || url.hash) {
    out.push({ level: "error", message: `${name} query string/fragment içeriyor — token sızıntısı riski; yalnız origin kullanın.` });
  }
  if (url.protocol !== "https:") {
    out.push({ level: "error", message: `${name} HTTPS değil (${url.protocol}) — iOS ATS / Android cleartext nedeniyle https:// zorunlu.` });
  }

  const hostClass = classifyHost(url.hostname, productionHosts(env));
  if (["loopback", "private", "link-local", "unspecified", "internal"].includes(hostClass)) {
    out.push({ level: "error", message: `${name} public değil (${hostClass}) — gerçek cihaz/store reviewer erişemez; public HTTPS domain kullanın.` });
  } else if (expectProduction && hostClass !== "production") {
    out.push({ level: "error", message: `${name} production müşteri domain'i değil — production tier yalnız NEVII_PRODUCTION_HOSTS listesindeki host'ları kabul eder.` });
  } else if (!expectProduction && hostClass === "production") {
    out.push({ level: "error", message: `${name} PRODUCTION müşteri domain'ini gösteriyor — review/test için ayrı bir alt alan adı (ör. review.…) kullanın.` });
  }

  if (out.length === 0) out.push({ level: "ok", message: `${name}: ${redactedOrigin(url)} (${hostClass})` });
  return out;
}

function checkDatabase(name: string, raw: string | undefined, expected: "test" | "production", required: boolean): Finding[] {
  if (!(raw ?? "").trim()) {
    return required ? [{ level: "error", message: `${name} eksik — ${expected} Supabase connection string'ini ekleyin.` }] : [];
  }
  const info = classifyDatabaseTarget(raw);
  if (info.classification === "unparseable") {
    return [{ level: "error", message: `${name} malformed — geçerli postgresql:// URL değil.` }];
  }
  if (info.classification === expected) return [{ level: "ok", message: `${name}: points-to-expected-tier (${info.safeLabel})` }];
  if (info.classification === "production") {
    return [{ level: "error", message: `${name} UNSAFE-TIER: PRODUCTION Supabase'i gösteriyor — review/test ortamına production DB bağlanamaz.` }];
  }
  if (info.classification === "test") {
    return [{ level: "error", message: `${name} UNSAFE-TIER: TEST Supabase'i gösteriyor — production deployment test DB'ye bağlanamaz.` }];
  }
  return [{ level: "error", message: `${name} beklenen ${expected} projesine işaret etmiyor (hedef=${info.classification}) — fail-closed.` }];
}

const truthy = (v: string | undefined) => ["1", "true", "yes"].includes((v ?? "").trim().toLowerCase());
const lower = (v: string | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Review/test'te gerçek dış aksiyon açık mı? Seçim kuralları kaynakla aynı:
 * src/lib/{payment-provider,email,whatsapp,sms}/config.ts. Değer yazılmaz.
 */
function checkProvidersOff(env: Env): Finding[] {
  const out: Finding[] = [];
  const payment = lower(env.PAYMENT_PROVIDER);
  if (payment === "stripe" || (payment === "iyzico" && !lower(env.IYZICO_BASE_URL).includes("sandbox") && lower(env.IYZICO_BASE_URL) !== "")) {
    out.push({ level: "error", message: "PAYMENT_PROVIDER gerçek tahsilat modunda — review/test'te boş bırakın (console) veya yalnız iyzico sandbox kullanın." });
  }
  const email = lower(env.EMAIL_PROVIDER);
  if (email === "smtp" || (email !== "console" && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)) {
    out.push({ level: "error", message: "E-posta SMTP ile gerçek gönderim yapıyor — review/test'te EMAIL_PROVIDER=console yapın veya SMTP_* değişkenlerini kaldırın." });
  }
  const whatsapp = lower(env.WHATSAPP_PROVIDER);
  if (whatsapp && whatsapp !== "console") {
    out.push({ level: "error", message: "WHATSAPP_PROVIDER gerçek sağlayıcı — review/test'te boş bırakın (console)." });
  }
  const sms = lower(env.SMS_PROVIDER);
  const smsLive = sms === "twilio" || (sms !== "console" && env.TWILIO_ACCOUNT_SID && (env.TWILIO_SMS_FROM || env.TWILIO_FROM));
  if (smsLive && !truthy(env.SMS_TEST_MODE)) {
    out.push({ level: "error", message: "SMS Twilio ile gerçek gönderimde ve SMS_TEST_MODE kapalı — SMS_PROVIDER=console veya SMS_TEST_MODE=true + allowlist." });
  }
  if (out.length === 0) out.push({ level: "ok", message: "Ödeme/e-posta/WhatsApp/SMS: gerçek dış aksiyon kapalı." });
  return out;
}

export function validateMobileReviewEnv(env: Env, target: Target = "web"): Finding[] {
  const tierRaw = lower(env.NEVII_DEPLOYMENT_TIER);
  if (!tierRaw) {
    return [{ level: "error", message: "NEVII_DEPLOYMENT_TIER tanımlı değil — review, test veya production olarak ayarlayın." }];
  }
  if (!(TIERS as readonly string[]).includes(tierRaw)) {
    return [{ level: "error", message: "NEVII_DEPLOYMENT_TIER geçersiz — izin verilen: review, test, production." }];
  }
  const tier = tierRaw as Tier;
  const isProd = tier === "production";
  const out: Finding[] = [{ level: "ok", message: `NEVII_DEPLOYMENT_TIER: ${tier} · hedef: ${target}` }];

  if (target === "store" && tier === "test") {
    out.push({
      level: "error",
      message: "test tier public store review için uygun değil — App Review/TestFlight/Internal Testing build'i NEVII_DEPLOYMENT_TIER=review ortamına bağlanmalı.",
    });
  }

  const nodeEnv = lower(env.NODE_ENV);
  if (nodeEnv === "development") {
    out.push({ level: "error", message: "NODE_ENV=development — review/test/production build development modunda hazırlanamaz." });
  } else if (target === "web" && nodeEnv !== "production") {
    out.push({ level: "error", message: "NODE_ENV production değil — deploy build'i NODE_ENV=production ile doğrulayın." });
  }

  const vercelEnv = lower(env.VERCEL_ENV);
  const branch = lower(env.VERCEL_GIT_COMMIT_REF);
  if (isProd) {
    if (vercelEnv && vercelEnv !== "production") {
      out.push({ level: "error", message: "production tier ama VERCEL_ENV production değil — production değişkenleri Preview'a yazılmış olabilir." });
    }
    if (branch && branch !== "main") {
      out.push({ level: "error", message: "production tier ama kaynak branch main değil — review/test branch'i production'a deploy edilemez." });
    }
  } else {
    if (vercelEnv === "production") {
      out.push({ level: "error", message: `${tier} tier ama VERCEL_ENV=production — test/review ayarları gerçek production deployment'a bağlanamaz.` });
    }
    if (branch === "main") {
      out.push({ level: "error", message: `${tier} tier ama kaynak branch main — review/test deploy'u ayrı branch'ten yapılmalı.` });
    }
  }

  if (target === "web") {
    if (lower(env.STORE_MODE) !== "db") {
      out.push({ level: "error", message: "STORE_MODE db değil — json/memory Vercel'de kalıcı değildir (cold start'ta veri kaybolur); STORE_MODE=db yapın." });
    } else {
      out.push({ level: "ok", message: "STORE_MODE: db" });
    }
    const expected = isProd ? "production" : "test";
    out.push(...checkDatabase("DATABASE_URL", env.DATABASE_URL, expected, true));
    out.push(...checkDatabase("DIRECT_URL", env.DIRECT_URL, expected, false));

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!isProd && supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
      out.push({ level: "error", message: "NEXT_PUBLIC_SUPABASE_URL PRODUCTION Supabase projesini gösteriyor — test projesinin URL'ini kullanın." });
    }
    if (isProd && supabaseUrl.includes(TEST_SUPABASE_REF)) {
      out.push({ level: "error", message: "NEXT_PUBLIC_SUPABASE_URL TEST Supabase projesini gösteriyor — production deployment test storage'a bağlanamaz." });
    }

    out.push(...checkPublicUrl("APP_BASE_URL", env.APP_BASE_URL || env.NEXT_PUBLIC_APP_BASE_URL, env, isProd));

    if (isProd) {
      const demoVars = Object.keys(env).filter((k) => k.startsWith("AUTH_DEMO_") && (env[k] ?? "").trim());
      if (demoVars.length > 0) {
        out.push({ level: "error", message: `Production'da demo hesap yapılandırması var (${demoVars.join(", ")}) — kaldırın.` });
      }
      if (truthy(env.SMS_TEST_MODE)) {
        out.push({ level: "error", message: "Production'da SMS_TEST_MODE açık — test yapılandırması production'a taşınmış; kapatın." });
      }
    } else {
      out.push(...checkProvidersOff(env));
    }
  } else {
    out.push(...checkPublicUrl("EXPO_PUBLIC_API_URL", env.EXPO_PUBLIC_API_URL, env, isProd));
    const api = env.EXPO_PUBLIC_API_URL;
    const app = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_BASE_URL;
    if (api && app) {
      try {
        if (new URL(api).origin !== new URL(app).origin) {
          out.push({ level: "warn", message: "EXPO_PUBLIC_API_URL ile APP_BASE_URL farklı origin'ler — mobil build doğru backend'e mi bağlanıyor, kontrol edin." });
        }
      } catch {
        // malformed durum checkPublicUrl'de zaten hata olarak raporlandı
      }
    }
  }

  if (tier === "review") {
    out.push(
      { level: "manual", message: "Review domain'inde `curl -sI <url> | grep -i x-robots-tag` → noindex, nofollow görülmeli (bkz. runbook §2)." },
      { level: "manual", message: "Vercel Deployment Protection (SSO) review domain'inde /api/v1/** native çağrılarını bloklamamalı." },
      { level: "manual", message: "Demo Student/Guardian/Teacher hesapları gerçek kişi içermiyor; parolalar dokümana/loga yazılmadı." },
    );
  }
  return out;
}

/** Tier'a göre arama motoru politikası. Bilinmeyen/eksik tier fail-closed: noindex. */
export function robotsPolicyForTier(tier: string | undefined): { index: boolean; follow: boolean; xRobotsTag: string | null } {
  return lower(tier) === "production"
    ? { index: true, follow: true, xRobotsTag: null }
    : { index: false, follow: false, xRobotsTag: "noindex, nofollow" };
}

const LABEL: Record<Level, string> = { ok: "OK", error: "HATA", warn: "UYARI", manual: "MANUEL" };

export function formatReport(findings: Finding[]): { text: string; exitCode: 0 | 1 } {
  const failed = findings.some((f) => f.level === "error");
  const lines = findings.map((f) => `[${LABEL[f.level]}] ${f.message}`);
  lines.push(failed ? "\n[PREFLIGHT BAŞARISIZ] ortam güvenli değil — yukarıdaki HATA satırlarını düzeltin." : "\n[PREFLIGHT OK] ortam kontrolleri geçti (MANUEL maddeleri ayrıca onaylayın).");
  return { text: lines.join("\n"), exitCode: failed ? 1 : 0 };
}
