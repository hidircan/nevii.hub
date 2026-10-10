/**
 * Maliyet/kota verimlilik preflight'ı. Build/deploy ÇALIŞTIRMAZ, ağa bağlanmaz,
 * `.env` dosyası OKUMAZ, hiçbir secret değerini yazmaz (uzunluk sınıfı hariç).
 *
 * Kullanım:
 *   npm run preflight:cost-efficiency
 *
 * Çıkış kodu: HATA yoksa 0, aksi halde 1 (fail-closed). CI'da çalışır.
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

type Level = "ok" | "error" | "warn";
type Finding = { level: Level; rule: string; message: string };

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const findings: Finding[] = [];
function add(level: Level, rule: string, message: string): void {
  findings.push({ level, rule, message });
}

async function readFile(rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(REPO_ROOT, rel), "utf-8");
  } catch {
    return null;
  }
}

async function listFiles(relDir: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean }> = [];
    try {
      entries = (await fs.readdir(path.join(REPO_ROOT, dir), { withFileTypes: true })) as never;
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        await walk(rel);
      } else if (exts.some((ext) => e.name.endsWith(ext))) {
        out.push(rel);
      }
    }
  }
  await walk(relDir);
  return out;
}

/** 1. Env hijyeni: değer yazdırmadan aralık doğrulaması. */
function checkEnv(): void {
  const raw = process.env.COST_METRICS_SAMPLE_RATE;
  if (raw === undefined || raw === "") {
    add("ok", "env.sample-rate", "COST_METRICS_SAMPLE_RATE tanımsız → varsayılan %10 örnekleme.");
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    add("error", "env.sample-rate", `COST_METRICS_SAMPLE_RATE aralık dışı ([0,1] olmalı, değer gizli, uzunluk ${raw.length}).`);
  } else {
    add("ok", "env.sample-rate", "COST_METRICS_SAMPLE_RATE [0,1] aralığında (değer gizli).");
  }
}

/** 2. Otomatik tetikleyiciler TTL-bilinçli kanaldan olmalı (doğrudan .refresh yasak). */
async function checkAutoRefreshWiring(): Promise<void> {
  const files = [
    ...(await listFiles("apps/mobile/app", [".tsx"])),
    ...(await listFiles("apps/mobile/src", [".tsx", ".ts"])),
  ];
  const hookDefs = new Set([
    path.join("apps/mobile/src/hooks", "use-focus-refetch.ts"),
    path.join("apps/mobile/src/hooks", "use-app-foreground-refetch.ts"),
  ]);
  let bad = 0;
  for (const rel of files) {
    if (hookDefs.has(rel)) continue;
    const content = (await readFile(rel)) ?? "";
    // useFocusRefetch(X.refresh) / useAppForegroundRefetch(X.refresh) — aynı
    // satırda veya çok-satırlı inline callback içinde.
    const re = /(useFocusRefetch|useAppForegroundRefetch)\([^;]*?\.refresh\s*(\(|\)|,)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      bad += 1;
      const line = content.slice(0, m.index).split("\n").length;
      add("error", "mobile.auto-refresh", `${rel}:${line} — otomatik tetikleyici doğrudan .refresh kullanıyor (autoRefresh olmalı).`);
      if (bad > 10) break;
    }
    if (bad > 10) break;
  }
  if (bad === 0) add("ok", "mobile.auto-refresh", "focus/foreground tetikleyicileri TTL-bilinçli (doğrudan .refresh yok).");
}

/** 3. Program çekişleri pencereli/sınırlı olmalı (tüm-geçmiş yasak). */
async function checkScheduleWindows(): Promise<void> {
  const files = [
    ...(await listFiles("apps/mobile/app", [".tsx"])),
    ...(await listFiles("apps/mobile/src", [".tsx", ".ts"])),
  ];
  let bad = 0;
  for (const rel of files) {
    const content = (await readFile(rel)) ?? "";
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (!line.includes("/schedule")) return;
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
      if (line.includes("from=") || line.includes("limit=")) return;
      // Gerçek URL kurulumları: "/schedule" + sonlandırıcı (tırnak/backtick/}).
      // Regex allowlist (`\/schedule/`) ve tip adları (`cls: "schedule"`) elenir.
      if (
        !line.includes("/schedule`") &&
        !line.includes('/schedule"') &&
        !line.includes("/schedule'") &&
        !line.includes("/schedule}")
      ) {
        return;
      }
      bad += 1;
      add("error", "mobile.schedule-window", `${rel}:${i + 1} — penceresiz/sınırsız program çekişi (from/limit gerekli).`);
    });
    if (bad > 10) break;
  }
  if (bad === 0) add("ok", "mobile.schedule-window", "tüm program çekişleri pencereli/sınırlı.");
}

/** 4. Agresif polling yok (izinli: use-now, canlı ders sayacı). */
async function checkPolling(): Promise<void> {
  const allowed = new Set([
    path.join("apps/mobile/src/hooks", "use-now.ts"),
    path.join("apps/mobile/src/components/ui", "live-lesson-timer.tsx"),
  ]);
  const files = [
    ...(await listFiles("apps/mobile/app", [".tsx", ".ts"])),
    ...(await listFiles("apps/mobile/src", [".tsx", ".ts"])),
  ];
  let bad = 0;
  for (const rel of files) {
    if (allowed.has(rel)) continue;
    const content = (await readFile(rel)) ?? "";
    if (content.includes("setInterval")) {
      bad += 1;
      add("error", "mobile.polling", `${rel} — setInterval bulundu (izinli liste dışı polling).`);
    }
  }
  if (bad === 0) add("ok", "mobile.polling", "izinsiz polling yok (use-now + canlı sayaç izinli).");
}

/** 5. Realtime aboneliği yok (push → hedefli revalidation mimarisi). */
async function checkRealtime(): Promise<void> {
  const files = [
    ...(await listFiles("apps/mobile/app", [".tsx", ".ts"])),
    ...(await listFiles("apps/mobile/src", [".tsx", ".ts"])),
    ...(await listFiles("src/lib", [".ts"])),
  ];
  const needles = [".channel(", "postgres_changes", ".subscribe("];
  let bad = 0;
  for (const rel of files) {
    const content = (await readFile(rel)) ?? "";
    for (const needle of needles) {
      if (content.includes(needle)) {
        bad += 1;
        add("error", "realtime.none", `${rel} — Realtime aboneliği bulundu (${needle}).`);
      }
    }
    if (bad > 5) break;
  }
  if (bad === 0) add("ok", "realtime.none", "Realtime aboneliği yok.");
}

/** 6. JSON API'de public cache yok (branding logosu hariç). */
async function checkPublicCache(): Promise<void> {
  const files = await listFiles("src/app/api", [".ts"]);
  const allowed = "src/app/api/v1/branding/platform-logo/route.ts";
  let bad = 0;
  for (const rel of files) {
    if (rel === allowed) continue;
    const content = (await readFile(rel)) ?? "";
    if (content.includes("public, max-age") || content.includes("public,max-age")) {
      bad += 1;
      add("error", "api.private-cache", `${rel} — public Cache-Control bulundu (kişisel veri riski).`);
    }
  }
  const http = (await readFile("src/lib/api/http.ts")) ?? "";
  if (!http.includes("private, no-store") || !http.includes('Vary')) {
    bad += 1;
    add("error", "api.private-cache", "src/lib/api/http.ts — merkezi private,no-store + Vary eksik.");
  }
  if (bad === 0) add("ok", "api.private-cache", "JSON API merkezi private,no-store; izinsiz public cache yok.");
}

/** 7. Mutation retry yok + limit üst sınırları (tripwire). */
async function checkGuards(): Promise<void> {
  const client = (await readFile("apps/mobile/src/api/client.ts")) ?? "";
  const mutationsSingle = ["apiPost", "apiPatch", "apiDelete"].every((fn) => {
    const idx = client.indexOf(`export function ${fn}`);
    if (idx < 0) return false;
    const body = client.slice(idx, idx + 600);
    return body.includes("retryable: false");
  });
  if (!mutationsSingle) add("error", "mobile.no-mutation-retry", "mobil client — mutation'larda retryable:false korunmalı.");
  else add("ok", "mobile.no-mutation-retry", "mutation'larda otomatik retry yok.");

  const policy = (await readFile("apps/mobile/src/api/request-policy.ts")) ?? "";
  if (!policy.includes("status >= 500") || !policy.includes("SEARCH_MIN_CHARS = 2")) {
    add("error", "mobile.retry-policy", "request-policy.ts — 5xx-only retry + min-2-karakter eşiği korunmalı.");
  } else {
    add("ok", "mobile.retry-policy", "retry politikası + arama eşiği korunuyor.");
  }

  const checks: Array<[string, string, string]> = [
    ["src/lib/services/admin-lists.ts", ".max(100)", "admin liste limiti ≤100"],
    ["src/lib/services/student-ledgers.ts", ".max(200)", "ledger limiti ≤200"],
    ["src/lib/services/tools.ts", ".max(2000)", "program limiti ≤2000"],
    ["src/lib/http/server-cache.ts", "tenantCacheKey", "sunucu cache tenant-kapsamlı"],
  ];
  for (const [rel, needle, label] of checks) {
    const content = (await readFile(rel)) ?? "";
    if (!content.includes(needle)) add("error", "api.limits", `${rel} — beklenen koruma kayıp (${label}).`);
    else add("ok", "api.limits", `${label}.`);
  }
}

/** 8. Açık (public) uç envanteri — yeni public uç alarm üretir. */
async function checkPublicEndpoints(): Promise<void> {
  const known = new Set([
    "src/app/api/v1/ready/route.ts",
    "src/app/api/v1/health/route.ts",
    "src/app/api/v1/auth/login/route.ts",
    "src/app/api/v1/auth/refresh/route.ts",
    "src/app/api/v1/auth/logout/route.ts",
    "src/app/api/v1/auth/forgot-password/route.ts",
    "src/app/api/v1/auth/reset-password/route.ts",
    "src/app/api/v1/auth/accept-invitation/route.ts",
    "src/app/api/v1/catalog/plans/route.ts",
    "src/app/api/v1/password-reset/route.ts",
    "src/app/api/v1/account/email-change/confirm/route.ts",
    "src/app/api/v1/invitations/[inviteId]/accept/route.ts",
  ]);
  const files = await listFiles("src/app/api", [".ts"]);
  let bad = 0;
  for (const rel of files) {
    const content = (await readFile(rel)) ?? "";
    if (content.includes("public: true") && !known.has(rel)) {
      bad += 1;
      add("warn", "api.public-inventory", `${rel} — envanter dışı public uç (bilinçliyse listeye ekleyin).`);
    }
  }
  if (bad === 0) add("ok", "api.public-inventory", "public uç envanteri değişmedi (12 bilinen).");
}

async function main(): Promise<void> {
  checkEnv();
  await checkAutoRefreshWiring();
  await checkScheduleWindows();
  await checkPolling();
  await checkRealtime();
  await checkPublicCache();
  await checkGuards();
  await checkPublicEndpoints();

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  for (const f of findings) {
    const tag = f.level === "error" ? "HATA" : f.level === "warn" ? "UYARI" : "OK";
    console.log(`[${tag}] ${f.rule}: ${f.message}`);
  }
  console.log(`\npreflight:cost-efficiency — ${errors.length} hata, ${warns.length} uyarı.`);
  if (errors.length > 0) process.exit(1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) void main();
