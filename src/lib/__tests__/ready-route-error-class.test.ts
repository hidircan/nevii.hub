/**
 * `/api/v1/ready` — veritabanı hata sınıfı sızıntı testleri.
 *
 * Sözleşme (2026-09-14, public staging): hata sınıfı HİÇBİR ortamda public
 * yanıta konmaz (preview dahil) — yalnız sunucu loguna yazılır. Tam public
 * sözleşme testleri: `ready-route.test.ts`.
 *
 * Gerçek bir veritabanına BAĞLANMAZ; `@/lib/db` mock'lanır. Kullanılan hata
 * metni UYDURMA'dır ve kasten "secret gibi" görünecek şekilde yazılmıştır ki
 * response'a sızmadığı doğrulanabilsin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authError = Object.assign(
  new Error(
    'password authentication failed for user "postgres.vxzewyiwfshobjizzetw" ' +
      "postgresql://postgres:hunter2@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"
  ),
  { code: "28P01" }
);

vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config")>()),
  STORE_MODE: "db",
  isDbMode: true,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: () => {
      throw authError;
    },
  },
}));

async function readyBody(): Promise<{
  ok: boolean;
  data: { ready: boolean; database?: unknown; errorClass?: unknown };
}> {
  const { GET } = await import("@/app/api/v1/ready/route");
  const res = await GET(new Request("https://test.example/api/v1/ready", { method: "GET" }));
  return JSON.parse(await res.text());
}

describe("/api/v1/ready — database errorClass", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Vercel Preview'de de sınıf/database alanı public yanıta EKLENMEZ (yalnız ready=false)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.abc:redacted@x.pooler.supabase.com:6543/postgres");

    const body = await readyBody();
    expect(body.data.ready).toBe(false);
    expect(body.data).not.toHaveProperty("database");
    expect(body.data).not.toHaveProperty("errorClass");
  });

  it("PRODUCTION'da errorClass/database alanı HİÇ eklenmez", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");

    const body = await readyBody();
    expect(body.data.ready).toBe(false);
    expect(body.data).not.toHaveProperty("database");
    expect(body.data).not.toHaveProperty("errorClass");
  });

  it("VERCEL_ENV tanınmıyorsa fail-closed — alan eklenmez", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NODE_ENV", "production");

    const body = await readyBody();
    expect(body.data).not.toHaveProperty("database");
    expect(body.data).not.toHaveProperty("errorClass");
  });

  it("hiçbir ortamda ham hata metni / connection string sızmaz", async () => {
    for (const env of ["preview", "production"]) {
      vi.resetModules();
      vi.stubEnv("VERCEL_ENV", env);
      const { GET } = await import("@/app/api/v1/ready/route");
      const text = await (
        await GET(new Request("https://test.example/api/v1/ready", { method: "GET" }))
      ).text();
      expect(text).not.toMatch(/hunter2|postgresql:\/\/|pooler\.supabase\.com|vxzewyiwfshobjizzetw/);
      expect(text).not.toMatch(/password authentication failed/i);
    }
  });
});
