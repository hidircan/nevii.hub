/**
 * Public (kimliksiz) API yüzeyi — test.neviihub.com SSO'suz public olduğu için
 * hiçbir public yanıt marka dışı ad, store/DB/provider durumu, env değişkeni
 * adı veya ham hata taşımamalı. Envanter: docs/release/PUBLIC_ENDPOINT_SECURITY_INVENTORY.md
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const API = path.join(ROOT, "src/app/api");

const FORBIDDEN = [
  /notaplan/i,
  /storeMode/i,
  /"database"/i,
  /"storage"/i,
  /"sms"/i,
  /provider/i,
  /configured/i,
  /reachable/i,
  /errorClass/i,
  /supabase/i,
  /prisma/i,
  /postgres/i,
  /_SECRET|_TOKEN|_KEY\b|DATABASE_URL|DIRECT_URL/,
  /yapılandır/i, // "yapılandırılmamış/yapılandırılmadı" → config durumu sızıntısı
  /\bat .+:\d+:\d+/, // stack frame
];

function expectPublicSafe(text: string) {
  for (const re of FORBIDDEN) expect(text, String(re)).not.toMatch(re);
}

const get = (p: string) => new Request(`https://test.example${p}`, { method: "GET" });
const post = (p: string, headers: Record<string, string> = {}) =>
  new Request(`https://test.example${p}`, { method: "POST", body: "{}", headers });

describe("public route envanteri", () => {
  it("`public: true` route kümesi envanterle birebir aynı (yeni public route → envanter + test güncellenmeli)", () => {
    const files = (readdirSync(API, { recursive: true }) as string[])
      .filter((f) => f.endsWith("route.ts"))
      .filter((f) => /public:\s*true/.test(readFileSync(path.join(API, f), "utf8")))
      .map((f) => f.split(path.sep).join("/"))
      .sort();
    expect(files).toEqual([
      "v1/account/email-change/confirm/route.ts",
      "v1/auth/accept-invitation/route.ts",
      "v1/auth/forgot-password/route.ts",
      "v1/auth/login/route.ts",
      "v1/auth/logout/route.ts",
      "v1/auth/refresh/route.ts",
      "v1/auth/reset-password/route.ts",
      "v1/catalog/plans/route.ts",
      "v1/health/route.ts",
      "v1/invitations/[inviteId]/accept/route.ts",
      "v1/password-reset/route.ts",
      "v1/ready/route.ts",
    ]);
    const doc = readFileSync(path.join(ROOT, "docs/release/PUBLIC_ENDPOINT_SECURITY_INVENTORY.md"), "utf8");
    for (const f of files) expect(doc, f).toContain(`/api/${f.replace(/\/route\.ts$/, "")}`);
  });

  it("public route kaynaklarında env değeri/ham hata yanıta yazılmaz", () => {
    const files = (readdirSync(API, { recursive: true }) as string[]).filter((f) => f.endsWith("route.ts"));
    for (const f of files) {
      const src = readFileSync(path.join(API, f), "utf8");
      if (!/public:\s*true/.test(src)) continue;
      expect(src, f).not.toMatch(/error\.(stack|cause)/);
      expect(src, f).not.toMatch(/ok\(\{[^}]*process\.env/);
    }
  });
});

describe("GET /api/v1/health — public-safe liveness", () => {
  it("200, ok=true, yalnız { service: NeviiHub, healthy: true, time }", async () => {
    const { GET } = await import("@/app/api/v1/health/route");
    const res = await GET(get("/api/v1/health"));
    const text = await res.text();
    const body = JSON.parse(text);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(["healthy", "service", "time"]);
    expect(body.data).toMatchObject({ service: "NeviiHub", healthy: true });
    expect(new Date(body.data.time).toISOString()).toBe(body.data.time);
    expectPublicSafe(text);
  });

  it("review/test tier'da health + ready yolları X-Robots-Tag: noindex, nofollow alır; production'da almaz", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const headersFor = async (tier: string, vercelEnv: string) => {
      vi.stubEnv("NEVII_DEPLOYMENT_TIER", tier);
      vi.stubEnv("VERCEL_ENV", vercelEnv);
      return nextConfig.headers!();
    };
    for (const tier of ["review", "test"]) {
      const rules = await headersFor(tier, "preview");
      for (const p of ["/api/v1/health", "/api/v1/ready"]) {
        // Tek kural `/:path*` → /api/** dahil tüm yollar.
        const applied = rules.filter((r) => r.source === "/:path*");
        expect(applied.flatMap((r) => r.headers), `${tier} ${p}`).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
      }
    }
    const prod = await headersFor("production", "production");
    expect(prod.flatMap((r) => r.headers).some((h) => h.key.toLowerCase() === "x-robots-tag")).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("secret/imza korumalı public uçlar — yapılandırma durumu ve env adı sızmaz", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["NOTIFICATION_CRON_SECRET", "RETENTION_CRON_SECRET", "RELEASE_EVENT_SECRET"];
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("notifications/tick secret yokken 403 — mesaj yanlış secret ile aynı", async () => {
    const { POST } = await import("@/app/api/v1/notifications/tick/route");
    const unconfigured = await POST(post("/api/v1/notifications/tick"));
    const unconfiguredText = await unconfigured.text();
    expect(unconfigured.status).toBe(403);
    expectPublicSafe(unconfiguredText);
    process.env.NOTIFICATION_CRON_SECRET = "tick-secret-for-tests";
    const wrong = await POST(post("/api/v1/notifications/tick", { authorization: "Bearer yanlis" }));
    expect(wrong.status).toBe(403);
    expect(JSON.parse(await wrong.text()).error.message).toBe(JSON.parse(unconfiguredText).error.message);
  });

  it("platform/jobs/retention ve platform/releases/events secret yokken 503 — env adı yok", async () => {
    const retention = await import("@/app/api/v1/platform/jobs/retention/route");
    const releases = await import("@/app/api/v1/platform/releases/events/route");
    const accrual = await import("@/app/api/v1/platform/jobs/monthly-accrual/route");
    for (const res of [
      await retention.POST(post("/api/v1/platform/jobs/retention")),
      await releases.POST(post("/api/v1/platform/releases/events")),
      await accrual.POST(post("/api/v1/platform/jobs/monthly-accrual?apply=1")),
    ]) {
      expect(res.status).toBe(503);
      expectPublicSafe(await res.text());
    }
  });

  it("payments/webhook (sağlayıcı yok) ve communications/webhook tek tip mesaj döner — sağlayıcı durumu sızmaz", async () => {
    const payments = await import("@/app/api/v1/payments/webhook/route");
    const pay = await payments.POST(post("/api/v1/payments/webhook", { "x-iyz-signature-v3": "x", "x-forwarded-for": "203.0.113.7" }));
    expect(pay.status).toBe(401);
    expectPublicSafe(await pay.text());

    const comms = await import("@/app/api/v1/communications/webhook/route");
    const com = await comms.POST(post("/api/v1/communications/webhook", { "x-signature": "x", "x-forwarded-for": "203.0.113.8" }));
    expect([401, 503]).toContain(com.status);
    expectPublicSafe(await com.text());
  });
});
