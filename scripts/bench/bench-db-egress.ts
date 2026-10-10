/**
 * DB egress bench'i — GERÇEK sayfa/API yollarını (RSC render dahil) yerel bir
 * `next start` üzerinden çağırır ve her istek için ölçer:
 *   - DB sorgu sayısı, DB'den GELEN bayt (pg soketi; Supabase "Database egress" yönü),
 *   - sunucu yanıt süresi (yerel; ağ RTT'si yok — mutlak süre değil, göreli),
 *   - görünen metnin özeti (önce/sonra aynı mı? — script/style atılmış düz metin).
 * Önce/sonra aynı URL listesi, aynı sentetik veri (seed-egress-bench.ts).
 *
 *   npx tsx scripts/bench/bench-db-egress.ts --app <worktree> --label before|after [--repeats 3]
 *
 * Yalnız yerel tek kullanımlık DB (guard). Kişisel veri/SQL parametresi loglanmaz; çıktı
 * yalnız sayısal toplamlar + görünen metin özetleri (sentetik veri) içerir.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertDisposableLocalTarget } from "./seed-egress-bench";

const DB_URL = process.env.DATABASE_URL ?? "postgresql://hidircanyagiz@127.0.0.1:5432/neviihub_egress_bench";
const JWT_SECRET = "bench-only-secret-0123456789abcdef";
const TENANT = "tenant_nilufer_acar";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} gerekli`);
}

/** `as` verilmezse kurum sahibi (SUPER_ADMIN) oturumu; portal sayfaları kendi rolüyle ölçülür. */
export const FLOWS: { name: string; path: string; as?: "teacher" | "student" }[] = [
  { name: "Panel özeti", path: "/panel" },
  { name: "Öğrenciler listesi", path: "/panel/ogrenciler" },
  { name: "Öğrenci detay — özet", path: "/panel/ogrenciler/s1" },
  { name: "Öğrenci detay — bilgiler", path: "/panel/ogrenciler/s1/bilgiler" },
  { name: "Öğrenci detay — program", path: "/panel/ogrenciler/s1/program" },
  { name: "Öğrenci detay — ödemeler", path: "/panel/ogrenciler/s1/odemeler" },
  { name: "Öğrenci detay — sözleşmeler", path: "/panel/ogrenciler/s1/sozlesmeler" },
  { name: "Öğrenci detay — gelişim", path: "/panel/ogrenciler/s1/gelisim" },
  { name: "Öğrenci detay — evraklar", path: "/panel/ogrenciler/s1/evraklar" },
  { name: "Ders Programı", path: "/panel/program" },
  { name: "Yoklama (sayfa)", path: "/panel/yoklama?studentId=s1" },
  { name: "Yoklama takvimi API (dönem)", path: "/api/v1/attendance-calendar/term?studentId=s1&term=guz&anchorYear=2026" },
  { name: "Hakedişler", path: "/panel/hakedisler" },
  { name: "Telafi", path: "/panel/telafi" },
  { name: "Ödemeler", path: "/panel/odemeler" },
  { name: "Öğretmenler", path: "/panel/ogretmenler" },
  { name: "Paketler", path: "/panel/paketler" },
  { name: "Bildirim zili API", path: "/api/v1/notifications" },
  { name: "Oturum durumu API (30 sn polling)", path: "/api/v1/auth/session-status" },
  { name: "Öğretmen portalı — program (45 sn yenileme)", path: "/ogretmen/program", as: "teacher" },
  { name: "Öğrenci/veli portalı (45 sn yenileme)", path: "/ogrenci", as: "student" },
  { name: "Öğretmen portalı — hakedişlerim", path: "/ogretmen/hakedis", as: "teacher" },
  { name: "Öğretmen portalı — hakediş detayı", path: "/ogretmen/hakedis/tpb_1", as: "teacher" },
  { name: "Kariyer sayfası (herkese açık)", path: "/kariyer/tenant_nilufer_acar" },
  { name: "İK ayarları", path: "/panel/ik/ayarlar" },
  // 2026-10-10 turu
  { name: "Öğretmen portalı — ana sayfa", path: "/ogretmen", as: "teacher" },
  { name: "Öğrenci ödeme profili", path: "/panel/odemeler/s1" },
  { name: "Makbuz", path: "/makbuz/pbx_0" },
];

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

type MeterSnapshot = { queries: number; bytesIn: number; patched: boolean; byTable: Record<string, number> };

async function meter(port: number, op: "read" | "reset"): Promise<MeterSnapshot> {
  const res = await fetch(`http://127.0.0.1:${port}/${op}`);
  return (await res.json()) as MeterSnapshot;
}

function topTables(byTable: Record<string, number>, n = 6): string {
  return Object.entries(byTable)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t, b]) => `${t}:${(b / 1024).toFixed(0)}`)
    .join(" ");
}

/** Görünen metin: script/style/yorum atılır, etiketler kaldırılır, boşluk daraltılır. */
export function visibleText(body: string, contentType: string): string {
  if (contentType.includes("application/json")) return body;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function waitReady(base: string, child: ChildProcess) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`next start çıktı (kod ${child.exitCode})`);
    try {
      const res = await fetch(`${base}/login`);
      if (res.status < 500) return;
    } catch {
      // henüz dinlemiyor
    }
    await sleep(500);
  }
  throw new Error("sunucu hazır olmadı");
}

async function main() {
  assertDisposableLocalTarget(DB_URL);
  const appDir = path.resolve(arg("app"));
  const label = arg("label");
  const repeats = Number(arg("repeats", "3"));
  const port = Number(arg("port", "3999"));
  const meterPort = port + 1;
  const outDir = path.resolve(arg("out", path.join(process.cwd(), ".bench-egress")));
  fs.mkdirSync(path.join(outDir, label), { recursive: true });

  process.env.JWT_SECRET = JWT_SECRET;
  const { issueTokenPair } = await import("../../src/lib/auth/jwt");
  const cookieFor = async (user: Parameters<typeof issueTokenPair>[0]) => {
    const t = await issueTokenPair(user);
    return `np_access=${t.accessToken}; np_refresh=${t.refreshToken}`;
  };
  const cookies = {
    owner: await cookieFor({ userId: "user_owner_nilufer", role: "SUPER_ADMIN", tenantId: TENANT }),
    teacher: await cookieFor({ userId: "user_teacher_t1", role: "TEACHER", tenantId: TENANT, teacherId: "t1" }),
    student: await cookieFor({ userId: "user_student_s1", role: "STUDENT", tenantId: TENANT, studentId: "s1" }),
  };

  const child = spawn(path.join(appDir, "node_modules/.bin/next"), ["start", "-p", String(port)], {
    cwd: appDir,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      STORE_MODE: "db",
      DATABASE_URL: DB_URL,
      JWT_SECRET,
      NEXT_TELEMETRY_DISABLED: "1",
      PG_METER_PORT: String(meterPort),
      NODE_OPTIONS: `--import ${path.resolve(__dirname, "pg-meter.mjs")}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  child.stdout?.on("data", (b) => (serverLog += b.toString()));
  child.stderr?.on("data", (b) => (serverLog += b.toString()));
  const base = `http://127.0.0.1:${port}`;
  const results: Record<string, unknown>[] = [];
  try {
    await waitReady(base, child);
    const probe = await meter(meterPort, "read");
    if (!probe.patched) throw new Error("pg ölçer sunucu sürecine bağlanamadı");

    const only = arg("only", "");
    for (const flow of FLOWS.filter((f) => !only || f.path.includes(only))) {
      const cookie = cookies[flow.as ?? "owner"];
      // Isınma (bağlantı havuzu, modül yükleme) — ölçüme girmez.
      await fetch(base + flow.path, { headers: { cookie }, redirect: "manual" }).then((r) => r.text());
      // Soğuk örnek: süreç içi 5 sn TTL önbellekleri (oturum/ayar) dolsun diye bekle.
      await sleep(5_500);
      const samples: { queries: number; bytesIn: number; ms: number; status: number; byTable: Record<string, number>; httpBytes: number }[] = [];
      let text = "";
      for (let i = 0; i < repeats + 1; i++) {
        await meter(meterPort, "reset");
        const t0 = performance.now();
        const res = await fetch(base + flow.path, { headers: { cookie }, redirect: "manual" });
        const body = await res.text();
        const ms = performance.now() - t0;
        const m = await meter(meterPort, "read");
        samples.push({ queries: m.queries, bytesIn: m.bytesIn, ms, status: res.status, byTable: m.byTable, httpBytes: Buffer.byteLength(body) });
        text = visibleText(body, res.headers.get("content-type") ?? "");
      }
      const [cold, ...warm] = samples;
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      const row = {
        flow: flow.name,
        path: flow.path,
        status: cold!.status,
        coldQueries: cold!.queries,
        coldKB: +(cold!.bytesIn / 1024).toFixed(1),
        warmQueries: med(warm.map((s) => s.queries)),
        warmKB: +(med(warm.map((s) => s.bytesIn)) / 1024).toFixed(1),
        warmMs: Math.round(med(warm.map((s) => s.ms))),
        // HTTP yanıt gövdesi (sıkıştırmasız) — DB egress'ten AYRI bir ölçü.
        httpKB: +(cold!.httpBytes / 1024).toFixed(1),
        coldTopTablesKB: topTables(cold!.byTable),
        textSha: createHash("sha256").update(text).digest("hex").slice(0, 12),
        // Sıradan bağımsız özet: Suspense akışında (panel/loading.tsx) parçaların HTML'deki sırası
        // zamanlamaya bağlıdır; içerik aynıysa bu özet aynı kalır.
        textBagSha: createHash("sha256").update(text.split(" ").sort().join(" ")).digest("hex").slice(0, 12),
        leaksOtherTenant: /BTENANT/.test(text),
      };
      fs.writeFileSync(path.join(outDir, label, `${flow.path.replace(/[^a-z0-9]+/gi, "_")}.txt`), text);
      results.push(row);
      console.log(JSON.stringify(row));
    }
  } finally {
    child.kill("SIGTERM");
    fs.writeFileSync(path.join(outDir, label, "server.log"), serverLog);
  }
  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
