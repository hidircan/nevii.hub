/**
 * `/api/v1/ready` — public-safe readiness sözleşmesi ve sızıntı testleri.
 *
 * Public yanıt YALNIZ `{ service, ready, time }` taşır. Store modu, veritabanı,
 * storage, SMS/provider durumu ve DB hata sınıfı public yanıtta YOKTUR; hata
 * sınıfı yalnız sunucu loguna yazılır.
 *
 * Gerçek bir veritabanına BAĞLANMAZ; `@/lib/db` mock'lanır. Hata metni UYDURMA'dır
 * ve kasten "secret gibi" yazılmıştır ki yanıta sızmadığı doğrulanabilsin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dbMode: true, dbError: null as Error | null }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

const SECRET_ERROR = Object.assign(
  new Error(
    'password authentication failed for user "postgres.vxzewyiwfshobjizzetw" ' +
      "postgresql://postgres:hunter2@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
  ),
  { code: "28P01" }
);

vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config")>()),
  get STORE_MODE() {
    return state.dbMode ? "db" : "json";
  },
  get isDbMode() {
    return state.dbMode;
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async () => {
      if (state.dbError) throw state.dbError;
      return [{ "?column?": 1 }];
    },
  },
}));

vi.mock("@/lib/logger", () => ({ logger }));

async function callReady() {
  const { GET } = await import("@/app/api/v1/ready/route");
  const res = await GET(new Request("https://test.example/api/v1/ready", { method: "GET" }));
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
}

const FORBIDDEN = [
  /notaplan/i,
  /storeMode/i,
  /database/i,
  /storage/i,
  /\bsms\b/i,
  /provider/i,
  /webhook/i,
  /supabase/i,
  /prisma/i,
  /postgres/i,
  /url/i,
  /token/i,
  /password/i,
  /secret/i,
  /hunter2/,
  /errorClass/i,
  /AUTHENTICATION/,
  /stack/i,
  /\bat .+:\d+:\d+/, // stack frame
];

function expectPublicSafe(text: string) {
  for (const re of FORBIDDEN) expect(text, String(re)).not.toMatch(re);
}

describe("/api/v1/ready — public-safe sözleşme", () => {
  beforeEach(() => {
    vi.resetModules();
    state.dbMode = true;
    state.dbError = null;
    logger.warn.mockClear();
    logger.error.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("200, ok=true, yalnız { service: NeviiHub, ready: true, time }", async () => {
    const { status, body, text } = await callReady();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(["ready", "service", "time"]);
    expect(body.data.service).toBe("NeviiHub");
    expect(body.data.ready).toBe(true);
    expect(body.data.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(body.data.time).toISOString()).toBe(body.data.time);
    expectPublicSafe(text);
  });

  it("json/memory modunda DB'ye gitmeden ready=true, aynı alanlar", async () => {
    state.dbMode = false;
    state.dbError = SECRET_ERROR; // çağrılsaydı ready=false olurdu
    const { status, body, text } = await callReady();
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ service: "NeviiHub", ready: true });
    expect(Object.keys(body.data).sort()).toEqual(["ready", "service", "time"]);
    expectPublicSafe(text);
  });

  it("DB hatasında ready=false; hiçbir ortamda hata sınıfı, ham mesaj veya connection string dönmez", async () => {
    state.dbError = SECRET_ERROR;
    for (const env of ["preview", "production", "development"]) {
      vi.resetModules();
      vi.stubEnv("VERCEL_ENV", env);
      vi.stubEnv("NODE_ENV", "production");
      const { status, body, text } = await callReady();
      expect(status, env).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.ready, env).toBe(false);
      expect(Object.keys(body.data).sort()).toEqual(["ready", "service", "time"]);
      expectPublicSafe(text);
    }
  });

  it("DB hata sınıfı yalnız sunucu loguna yazılır; ham mesaj loga da yazılmaz", async () => {
    state.dbError = SECRET_ERROR;
    await callReady();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { errorClass: "AUTHENTICATION" });
    const logged = JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logged).not.toMatch(/hunter2|postgresql:\/\/|pooler\.supabase\.com|password authentication/);
  });

  it("review/test tier'da /api/v1/ready dahil tüm yollara X-Robots-Tag: noindex, nofollow", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    for (const tier of ["review", "test"]) {
      vi.stubEnv("NEVII_DEPLOYMENT_TIER", tier);
      vi.stubEnv("VERCEL_ENV", "preview");
      const rules = await nextConfig.headers!();
      const rule = rules.find((r) => r.source === "/:path*");
      expect(rule, tier).toBeDefined();
      expect(rule!.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
  });
});
