/**
 * Çalıştırma: npm run test:release  (node:test + tsx; vitest include'u
 * yalnız src/lib/__tests__ olduğu için release script'leri burada test edilir).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { formatReport, robotsPolicyForTier, validateMobileReviewEnv, type Env } from "./mobile-review-env";

const SECRET = "S3cretPassw0rd";
const TEST_DB = `postgresql://postgres.vxzewyiwfshobjizzetw:${SECRET}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`;
const PROD_DB = `postgresql://postgres.uqkafczrplqitzumtrqy:${SECRET}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres`;

const reviewWeb: Env = {
  NEVII_DEPLOYMENT_TIER: "review",
  NODE_ENV: "production",
  STORE_MODE: "db",
  DATABASE_URL: TEST_DB,
  APP_BASE_URL: "https://review.neviihub.com",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "mobile-review",
};
const reviewMobile: Env = { NEVII_DEPLOYMENT_TIER: "review", EXPO_PUBLIC_API_URL: "https://review.neviihub.com" };

const errors = (env: Env, target?: "web" | "mobile" | "store") =>
  validateMobileReviewEnv(env, target).filter((f) => f.level === "error").map((f) => f.message);

test("review + HTTPS review URL + test DB → pass", () => {
  assert.deepEqual(errors(reviewWeb), []);
  assert.deepEqual(errors(reviewMobile, "mobile"), []);
  assert.deepEqual(errors(reviewMobile, "store"), []);
  assert.equal(formatReport(validateMobileReviewEnv(reviewWeb)).exitCode, 0);
});

test("review + localhost mobile API URL → fail", () => {
  for (const url of ["http://localhost:3000", "https://127.0.0.1", "https://0.0.0.0", "https://[::1]:3000"]) {
    assert.ok(errors({ ...reviewMobile, EXPO_PUBLIC_API_URL: url }, "mobile").length > 0, url);
  }
});

test("review + private LAN IP mobile API URL → fail", () => {
  for (const url of ["https://192.168.1.20:3000", "https://10.0.0.5", "https://172.20.1.1", "https://my-mac.local"]) {
    assert.ok(errors({ ...reviewMobile, EXPO_PUBLIC_API_URL: url }, "mobile").some((m) => m.includes("public değil")), url);
  }
});

test("review + production DB → fail (unsafe-tier)", () => {
  assert.ok(errors({ ...reviewWeb, DATABASE_URL: PROD_DB }).some((m) => m.includes("UNSAFE-TIER")));
  assert.ok(errors({ ...reviewWeb, DIRECT_URL: PROD_DB }).some((m) => m.startsWith("DIRECT_URL")));
});

test("review + production customer domain → fail", () => {
  assert.ok(errors({ ...reviewWeb, APP_BASE_URL: "https://neviihub.com" }).some((m) => m.includes("PRODUCTION müşteri")));
  assert.ok(errors({ ...reviewMobile, EXPO_PUBLIC_API_URL: "https://notaplan.vercel.app" }, "store").length > 0);
});

test("review + VERCEL_ENV=production veya main branch → fail", () => {
  assert.ok(errors({ ...reviewWeb, VERCEL_ENV: "production" }).length > 0);
  assert.ok(errors({ ...reviewWeb, VERCEL_GIT_COMMIT_REF: "main" }).length > 0);
});

test("review + NODE_ENV=development / STORE_MODE memory → fail", () => {
  assert.ok(errors({ ...reviewWeb, NODE_ENV: "development" }).length > 0);
  assert.ok(errors({ ...reviewMobile, NODE_ENV: "development" }, "mobile").length > 0);
  assert.ok(errors({ ...reviewWeb, STORE_MODE: "memory" }).some((m) => m.startsWith("STORE_MODE")));
});

test("review + gerçek provider açık → fail", () => {
  assert.ok(errors({ ...reviewWeb, PAYMENT_PROVIDER: "stripe" }).length > 0);
  assert.ok(errors({ ...reviewWeb, PAYMENT_PROVIDER: "iyzico", IYZICO_BASE_URL: "https://api.iyzipay.com" }).length > 0);
  assert.deepEqual(errors({ ...reviewWeb, PAYMENT_PROVIDER: "iyzico" }), []); // varsayılan sandbox
  assert.ok(errors({ ...reviewWeb, EMAIL_PROVIDER: "smtp" }).length > 0);
  assert.ok(errors({ ...reviewWeb, WHATSAPP_PROVIDER: "meta" }).length > 0);
  assert.ok(errors({ ...reviewWeb, SMS_PROVIDER: "twilio" }).length > 0);
  assert.deepEqual(errors({ ...reviewWeb, SMS_PROVIDER: "twilio", SMS_TEST_MODE: "true" }), []);
});

test("eksik / geçersiz tier → fail", () => {
  const { NEVII_DEPLOYMENT_TIER: _omit, ...noTier } = reviewWeb;
  void _omit;
  assert.ok(errors(noTier)[0].includes("NEVII_DEPLOYMENT_TIER"));
  assert.ok(errors({ ...reviewWeb, NEVII_DEPLOYMENT_TIER: "staging" }).length > 0);
});

test("test tier + store hedefi → review'a yönlendiren fail; mobile hedefi → pass", () => {
  const testMobile = { ...reviewMobile, NEVII_DEPLOYMENT_TIER: "test", EXPO_PUBLIC_API_URL: "https://test.neviihub.com" };
  assert.ok(errors(testMobile, "store").some((m) => m.includes("NEVII_DEPLOYMENT_TIER=review")));
  assert.deepEqual(errors(testMobile, "mobile"), []);
});

test("production tier: review branch / test DB / demo config / review domain → fail", () => {
  const prod: Env = {
    NEVII_DEPLOYMENT_TIER: "production",
    NODE_ENV: "production",
    STORE_MODE: "db",
    DATABASE_URL: PROD_DB,
    APP_BASE_URL: "https://neviihub.com",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
  };
  assert.deepEqual(errors(prod), []);
  assert.ok(errors({ ...prod, VERCEL_GIT_COMMIT_REF: "mobile-review" }).some((m) => m.includes("branch")));
  assert.ok(errors({ ...prod, VERCEL_ENV: "preview" }).length > 0);
  assert.ok(errors({ ...prod, DATABASE_URL: TEST_DB }).some((m) => m.includes("TEST Supabase")));
  assert.ok(errors({ ...prod, AUTH_DEMO_CSV_TEACHER_1: "x" }).some((m) => m.includes("AUTH_DEMO_CSV_TEACHER_1")));
  assert.ok(errors({ ...prod, SMS_TEST_MODE: "1" }).length > 0);
  assert.ok(errors({ ...prod, APP_BASE_URL: "https://review.neviihub.com" }).length > 0);
});

test("malformed URL ve malformed DB → fail", () => {
  assert.ok(errors({ ...reviewMobile, EXPO_PUBLIC_API_URL: "review.neviihub.com" }, "mobile").some((m) => m.includes("malformed")));
  assert.ok(errors({ ...reviewWeb, DATABASE_URL: "not a url" }).some((m) => m.includes("malformed")));
});

test("userinfo / token / query içeren URL → unsafe fail", () => {
  assert.ok(errors({ ...reviewMobile, EXPO_PUBLIC_API_URL: `https://u:${SECRET}@review.neviihub.com` }, "mobile").some((m) => m.includes("GÜVENSİZ")));
  assert.ok(errors({ ...reviewMobile, EXPO_PUBLIC_API_URL: `https://review.neviihub.com/?token=${SECRET}` }, "mobile").some((m) => m.includes("token")));
});

test("çıktı secret, ref, tam host veya query içermez", () => {
  const leaky: Env = {
    ...reviewWeb,
    DATABASE_URL: PROD_DB,
    DIRECT_URL: TEST_DB,
    APP_BASE_URL: `https://admin:${SECRET}@secret-host.review.neviihub.com/?token=${SECRET}`,
    EXPO_PUBLIC_API_URL: `https://secret-host.review.neviihub.com/?k=${SECRET}`,
    JWT_SECRET: SECRET,
  };
  const text = [
    formatReport(validateMobileReviewEnv(leaky, "web")).text,
    formatReport(validateMobileReviewEnv(leaky, "mobile")).text,
    formatReport(validateMobileReviewEnv(reviewWeb, "web")).text,
  ].join("\n");
  for (const needle of [SECRET, "uqkafczrplqitzumtrqy", "vxzewyiwfshobjizzetw", "secret-host", "review.neviihub.com", "aws-1-", "token="]) {
    assert.ok(!text.includes(needle), `sızıntı: ${needle}`);
  }
  assert.ok(text.includes("https://*.neviihub.com"), "yalnız redacted origin yazılmalı");
});

test("CLI çıkış kodu: pass → 0, fail → 1; secret stdout/stderr'e gitmez", () => {
  const cli = path.join(import.meta.dirname, "validate-mobile-review-env.ts");
  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const run = (env: Env, args: string[] = []) => {
    // Üst kabuğun env'i (gerçek DATABASE_URL vb.) çocuğa GEÇİRİLMEZ.
    const childEnv: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: process.env.PATH };
    Object.assign(childEnv, env);
    try {
      return { code: 0, out: execFileSync(tsx, [cli, ...args], { env: childEnv, encoding: "utf8", stdio: "pipe" }) };
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      return { code: e.status, out: e.stdout + e.stderr };
    }
  };
  assert.equal(run(reviewWeb).code, 0);
  const failed = run({ ...reviewWeb, DATABASE_URL: PROD_DB });
  assert.equal(failed.code, 1);
  assert.ok(!failed.out.includes(SECRET));
  assert.equal(run(reviewMobile, ["--target=nope"]).code, 1);
});

test("robots politikası: review/test/eksik → noindex,nofollow; production korunur", () => {
  for (const tier of ["review", "test", undefined, "garbage"]) {
    assert.deepEqual(robotsPolicyForTier(tier), { index: false, follow: false, xRobotsTag: "noindex, nofollow" });
  }
  assert.deepEqual(robotsPolicyForTier("production"), { index: true, follow: true, xRobotsTag: null });
  // Açık review/test, VERCEL_ENV=production olsa bile noindex kalır.
  assert.equal(robotsPolicyForTier("review", "production").xRobotsTag, "noindex, nofollow");
  assert.equal(robotsPolicyForTier("TEST", "production").xRobotsTag, "noindex, nofollow");
  // Tier eksik/geçersiz: yalnız Vercel production deployment'ı mevcut SEO'yu korur.
  assert.equal(robotsPolicyForTier(undefined, "production").xRobotsTag, null);
  assert.equal(robotsPolicyForTier(undefined, "preview").xRobotsTag, "noindex, nofollow");
});

test("next.config headers(): tier runtime'a bağlı; production'da X-Robots-Tag yok; değer sızdırmaz", async () => {
  const { default: nextConfig } = await import("../../next.config");
  const saved = { tier: process.env.NEVII_DEPLOYMENT_TIER, vercel: process.env.VERCEL_ENV };
  const headersFor = async (tier: string | undefined, vercelEnv?: string) => {
    for (const [k, v] of [["NEVII_DEPLOYMENT_TIER", tier], ["VERCEL_ENV", vercelEnv]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const rules = await nextConfig.headers!();
    return rules.flatMap((r) => r.headers);
  };
  try {
    for (const tier of ["review", "test", undefined, "garbage"]) {
      const h = await headersFor(tier, "preview");
      assert.deepEqual(h.filter((x) => x.key === "X-Robots-Tag"), [{ key: "X-Robots-Tag", value: "noindex, nofollow" }], String(tier));
      assert.ok(h.some((x) => x.key === "Content-Security-Policy"), "security header'lar korunur");
    }
    for (const [tier, vercelEnv] of [["production", "production"], [undefined, "production"]] as const) {
      const h = await headersFor(tier, vercelEnv);
      assert.ok(!h.some((x) => x.key.toLowerCase() === "x-robots-tag"), `production SEO korunur: ${tier}`);
    }
    // Header değeri sabit; URL/secret/env değeri içermez.
    process.env.APP_BASE_URL = `https://u:${SECRET}@review.neviihub.com`;
    const text = JSON.stringify(await headersFor("review", "preview"));
    for (const needle of [SECRET, "review.neviihub.com"]) assert.ok(!text.includes(needle), `sızıntı: ${needle}`);
  } finally {
    delete process.env.APP_BASE_URL;
    await headersFor(saved.tier, saved.vercel);
  }
});
