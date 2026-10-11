/**
 * Push/bildirim release preflight (Faz 5). Build/deploy ÇALIŞTIRMAZ, ağa
 * bağlanmaz, `.env` dosyası OKUMAZ, hiçbir secret değerini yazmaz.
 *
 * Kullanım:
 *   npm run preflight:push                  # fiziksel cihaz UAT öncesi (preview)
 *   npm run preflight:push -- --target=store # store gönderimi öncesi (daha katı)
 *
 * Çıkış kodu: HATA yoksa 0, aksi halde 1 (fail-closed).
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

type Level = "ok" | "error" | "warn" | "manual";
type Finding = { level: Level; message: string };
type Env = Record<string, string | undefined>;

const TARGETS = ["preview", "store"] as const;
type Target = (typeof TARGETS)[number];

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function isSet(v: string | undefined): boolean {
  return !!v && v.trim().length > 0;
}

/** Değer yazdırmadan uzunluk sınıfı (secret hijyeni). */
function lengthClass(v: string | undefined): "empty" | "short" | "ok" {
  if (!isSet(v)) return "empty";
  return v!.trim().length >= 16 ? "ok" : "short";
}

function isPublicHttps(raw: string | undefined): { ok: boolean; reason: string } {
  if (!isSet(raw)) return { ok: false, reason: "tanımsız" };
  let url: URL;
  try {
    url = new URL(raw!.trim());
  } catch {
    return { ok: false, reason: "geçersiz URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "https değil" };
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, reason: "yerel/ağ-içi host" };
  }
  return { ok: true, reason: "" };
}

async function readJson(rel: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(REPO_ROOT, rel), "utf-8")) as unknown;
  } catch {
    return null;
  }
}

export async function validatePushRelease(env: Env, target: Target): Promise<Finding[]> {
  const findings: Finding[] = [];
  const strict = target === "store";

  // 1. Backend anahtarları (varlık + uzunluk sınıfı; değer ASLA yazılmaz).
  const pushEnabled = env.PUSH_ENABLED === "true";
  findings.push(
    pushEnabled
      ? { level: "ok", message: "PUSH_ENABLED=true" }
      : { level: strict ? "error" : "warn", message: "PUSH_ENABLED=true değil — push gönderimi kapalı (fail-closed)" }
  );
  const tokenClass = lengthClass(env.EXPO_PUSH_ACCESS_TOKEN);
  findings.push(
    tokenClass === "ok"
      ? { level: "ok", message: "EXPO_PUSH_ACCESS_TOKEN tanımlı" }
      : tokenClass === "short"
        ? { level: "error", message: "EXPO_PUSH_ACCESS_TOKEN çok kısa — gerçek token girin" }
        : { level: strict ? "error" : "warn", message: "EXPO_PUSH_ACCESS_TOKEN tanımsız — push gönderimi kapalı" }
  );
  const cronClass = lengthClass(env.NOTIFICATION_CRON_SECRET);
  findings.push(
    cronClass === "ok"
      ? { level: "ok", message: "NOTIFICATION_CRON_SECRET tanımlı (uzunluk yeterli)" }
      : cronClass === "short"
        ? { level: "error", message: "NOTIFICATION_CRON_SECRET çok kısa (en az 16 karakter)" }
        : { level: "error", message: "NOTIFICATION_CRON_SECRET tanımsız — cron tick çalışmaz" }
  );

  // 2. Public API URL (cron hedefi + mobil build'e gömülü adres ayrı ayrı).
  const base = isPublicHttps(env.APP_BASE_URL);
  findings.push(
    base.ok
      ? { level: "ok", message: "APP_BASE_URL public https" }
      : { level: "error", message: `APP_BASE_URL public https değil (${base.reason}) — cron + Actions secret kontrolü` }
  );
  const mobileApi = env.EXPO_PUBLIC_API_URL;
  if (isSet(mobileApi)) {
    const m = isPublicHttps(mobileApi);
    findings.push(
      m.ok
        ? { level: "ok", message: "EXPO_PUBLIC_API_URL public https" }
        : {
            level: strict ? "error" : "warn",
            message: `EXPO_PUBLIC_API_URL public https değil (${m.reason}) — preview build yerel API'ye bakabilir, store'a ASLA`,
          }
    );
  } else {
    findings.push({ level: "warn", message: "EXPO_PUBLIC_API_URL tanımsız — EAS environment'dan gelecekse sorun yok" });
  }

  // 3. Repo dosyaları: app.json EAS projectId + eas.json profilleri + cron workflow.
  const appJson = (await readJson("apps/mobile/app.json")) as {
    expo?: { extra?: { eas?: { projectId?: string } }; owner?: string };
  } | null;
  const projectId = appJson?.expo?.extra?.eas?.projectId;
  findings.push(
    typeof projectId === "string" && projectId.length > 0
      ? { level: "ok", message: "app.json extra.eas.projectId tanımlı (değer yazdırılmadı)" }
      : { level: "error", message: "app.json extra.eas.projectId eksik — fiziksel cihaz push token'ı üretilemez" }
  );
  const eas = (await readJson("apps/mobile/eas.json")) as { build?: Record<string, unknown> } | null;
  const profiles = eas?.build ? Object.keys(eas.build) : [];
  for (const p of ["development", "preview", "production"]) {
    findings.push(
      profiles.includes(p)
        ? { level: "ok", message: `eas.json build profili: ${p}` }
        : { level: "error", message: `eas.json build profili eksik: ${p}` }
    );
  }
  let tick = "";
  try {
    tick = await fs.readFile(path.join(REPO_ROOT, ".github/workflows/notification-tick.yml"), "utf-8");
  } catch {
    tick = "";
  }
  findings.push(
    tick.includes("*/10 * * * *") && tick.includes("NOTIFICATION_CRON_SECRET") && tick.includes("APP_BASE_URL")
      ? { level: "ok", message: "notification-tick.yml: 10 dk cron + secret kapısı mevcut" }
      : { level: "error", message: "notification-tick.yml eksik/bozuk — 10 dk tick + secret kapısı gerekli" }
  );

  // 4. Manuel kapılar (komut doğrulayamaz — insan + cihaz gerekir).
  findings.push({ level: "manual", message: "EAS credentials: APNs (.p8) + FCM yapılandırıldı (eas credentials)" });
  findings.push({ level: "manual", message: "Fiziksel cihaz UAT: iOS + Android, foreground/background/killed (bkz. PUSH_PRODUCTION_RUNBOOK.md)" });
  findings.push({ level: "manual", message: "GitHub Actions secrets: APP_BASE_URL + NOTIFICATION_CRON_SECRET repo'ya girildi" });
  if (strict) {
    findings.push({ level: "manual", message: "Store: TestFlight/Internal Testing push denemesi + review hesabı bildirimi" });
  }
  return findings;
}

export function formatPushReport(findings: Finding[]): { text: string; exitCode: number } {
  const icon: Record<Level, string> = { ok: "OK  ", error: "HATA", warn: "UYARI", manual: "ELLE" };
  const lines = ["Push release preflight:", ...findings.map((f) => `  [${icon[f.level]}] ${f.message}`)];
  const errors = findings.filter((f) => f.level === "error").length;
  lines.push(errors > 0 ? `SONUÇ: ${errors} hata — release BLOKE.` : "SONUÇ: otomatik kontroller geçti (ELLE adımlar cihaza/insana ait).");
  return { text: lines.join("\n"), exitCode: errors > 0 ? 1 : 0 };
}

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length) ?? "preview";
  if (!(TARGETS as readonly string[]).includes(arg)) {
    console.error(`[HATA] --target geçersiz — izin verilen: ${TARGETS.join(", ")}`);
    process.exit(1);
  }
  const { text, exitCode } = formatPushReport(await validatePushRelease(process.env, arg as Target));
  (exitCode === 0 ? console.log : console.error)(text);
  process.exitCode = exitCode;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) void main();
