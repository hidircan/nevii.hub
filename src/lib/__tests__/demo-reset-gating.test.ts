import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isLocalDevTooling } from "../config";
import { resetDemoTool, resetToCleanTemplateTool } from "../services/tools";
import type { ServiceContext } from "../services/context";

/**
 * UAT kararı (2026-09-07) — "Demo verisini sıfırla" YIKICI bir geliştirici
 * aracıdır ve test/preview/production kullanıcı arayüzünde HİÇ görünmez,
 * hiçbir tenant yöneticisi rolüyle ÇALIŞTIRILAMAZ.
 *
 * 2026-09-22 — "Boş şablona sıfırla" AYNI kapıya alındı (önceden production
 * UI'da açıktı ve tenant verisini siliyordu).
 *
 * Bu dosya kapıyı İKİ katmanda da doğrular:
 *   1. Sunucu kapısı (`resetDemoTool` / `resetToCleanTemplateTool` fail-closed).
 *   2. Render noktaları — Kurulum Merkezi'nde `isLocalDevTooling()` ile koşullu.
 *
 * NOT: kapının AÇIK olduğu (yerel geliştirme) dal burada BİLEREK
 * çalıştırılmaz — araçlar gerçekten store'u sıfırlar.
 */

const ADMIN: ServiceContext = { role: "SCHOOL_ADMIN", userId: "user_admin", tenantId: "tenant_nilufer_acar" };
const SUPER: ServiceContext = { role: "SUPER_ADMIN", userId: "user_owner_nilufer", tenantId: "tenant_nilufer_acar" };

const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;

function setEnv(nodeEnv: string | undefined, vercel: string | undefined) {
  // NODE_ENV vitest'te readonly tiplenir; testte kasıtlı override (davranış
  // env'e bağlı olduğu için mock'lanamaz — gerçek değişkeni değiştirmek gerekir).
  const env = process.env as Record<string, string | undefined>;
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;
  if (vercel === undefined) delete env.VERCEL;
  else env.VERCEL = vercel;
}

afterEach(() => setEnv(originalNodeEnv, originalVercel));

describe("Demo reset — ortam kapısı", () => {
  it("production (Vercel) ortamında araç KAPALI", () => {
    setEnv("production", "1");
    expect(isLocalDevTooling()).toBe(false);
  });

  it("preview/test ortamında da KAPALI — Vercel Preview de NODE_ENV=production ile çalışır", () => {
    setEnv("production", "1");
    expect(isLocalDevTooling()).toBe(false);
    // NODE_ENV tek başına ayırt edici değil: VERCEL varsa development olsa bile kapalı.
    setEnv("development", "1");
    expect(isLocalDevTooling()).toBe(false);
  });

  it("yalnızca yerel geliştirmede (NODE_ENV!=production ve VERCEL yok) AÇIK", () => {
    setEnv("development", undefined);
    expect(isLocalDevTooling()).toBe(true);
  });
});

describe("Demo reset — sunucu tarafı fail-closed", () => {
  it("test/production ortamında SCHOOL_ADMIN çağrısı FORBIDDEN döner (store'a dokunmaz)", async () => {
    setEnv("production", "1");
    const result = await resetDemoTool(ADMIN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toContain("yerel geliştirmede");
    }
  });

  it("SUPER_ADMIN de aşamaz — rol yükseltmesi bu kapıyı geçmez", async () => {
    setEnv("production", "1");
    const result = await resetDemoTool(SUPER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("Boş şablona sıfırla — sunucu tarafı fail-closed", () => {
  it("production'da SCHOOL_ADMIN FORBIDDEN — store'a dokunmaz", async () => {
    setEnv("production", "1");
    const result = await resetToCleanTemplateTool(ADMIN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toMatch(/yerel geliştirmede|ops prosedürü/i);
    }
  });

  it("SUPER_ADMIN de aşamaz", async () => {
    setEnv("production", "1");
    const result = await resetToCleanTemplateTool(SUPER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("Demo reset — render noktaları", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("panel özet sayfasında (/panel) demo reset kontrolü HİÇ YOK", () => {
    const source = read("src/app/panel/page.tsx");
    expect(source).not.toContain("actionResetDemo");
    expect(source).not.toContain("SetupResetAction");
    // (Kaldırıldığını açıklayan yorum metni hariç) hiçbir tetikleyici/etiket kalmamalı.
    expect(source).not.toContain("triggerLabel");
  });

  it("Kurulum Merkezi'nde demo + boş şablon isLocalDevTooling() ile koşulludur", () => {
    const source = read("src/app/panel/kurulum/page.tsx");
    expect(source).toContain("isLocalDevTooling()");
    expect(source.indexOf("isLocalDevTooling()")).toBeLessThan(source.indexOf("action={actionResetDemo}"));
    expect(source.indexOf("isLocalDevTooling()")).toBeLessThan(source.indexOf("action={actionResetToCleanTemplate}"));
    expect(source).toContain('confirmPhrase="SIFIRLA"');
  });
});
