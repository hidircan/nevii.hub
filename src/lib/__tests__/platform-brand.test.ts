import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import type { AppRole } from "../auth/types";
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { getPlatformBrand, getPlatformLogo, PLATFORM_LOGO_KEY, resetPlatformLogo } from "../platform/branding";
import { setPlatformLogo } from "../platform/branding-upload";
import { getSettingOverride, listSettingOverrides, resetPlatformStoreForTests, upsertSettingOverride } from "../platform/store";
import { GET } from "../../app/api/v1/branding/platform-logo/route";

const sharp = (await import("sharp")).default;
const ROOT = process.cwd();
const ctx = (role: AppRole): ServiceContext => ({ role, userId: "u1", tenantId: role === "HYPER_ADMIN" ? PLATFORM_TENANT_ID : DEFAULT_TENANT_ID, channel: "web", requestId: "req_brand" });
const hyper = () => ctx("HYPER_ADMIN");
const url = (u: string) => new Request(`http://localhost${u}`);

/** Şeffaf zeminde siyah dikdörtgen: gerçek logonun biçimi, 1,1 MB dosyanın yerine büyük boyutlu. */
async function sampleLogo(width = 1400, height = 1100) {
  const shape = await sharp({ create: { width: Math.round(width * 0.64), height: Math.round(height * 0.64), channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shape }])
    .png()
    .toBuffer();
}
const upload = async (png: Buffer) => setPlatformLogo(hyper(), { mime: "image/png", dataBase64: png.toString("base64") });

beforeEach(async () => {
  await resetPlatformStoreForTests();
});

describe("platform logosu → tüm yüzeyler", () => {
  it("logo yokken varsayılana düşer; favicon dosya kuralı yok", async () => {
    const brand = await getPlatformBrand();
    expect(brand).toMatchObject({ custom: false, logoUrl: "/brand/logo.png", iconUrl: "/icon.png" });
    expect(existsSync(path.join(ROOT, "src/app/icon.png"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/favicon.ico"))).toBe(false);
  });

  it("yükleme sürümlü URL üretir, yeni logo yeni URL'dir (Date.now/random yok)", async () => {
    await upload(await sampleLogo());
    const first = await getPlatformBrand();
    expect(first.custom).toBe(true);
    expect(first.logoUrl).toMatch(/variant=logo&v=[a-f0-9]{16}$/);
    expect(first.iconUrl).toMatch(/variant=icon&v=[a-f0-9]{16}$/);
    expect(first.appleIconUrl).toMatch(/variant=apple&v=[a-f0-9]{16}$/);
    expect((await getPlatformBrand()).logoUrl).toBe(first.logoUrl);
    await upload(await sampleLogo(1300, 1000));
    expect((await getPlatformBrand()).logoUrl).not.toBe(first.logoUrl);
    expect(readFileSync(path.join(ROOT, "src/lib/platform/branding.ts"), "utf-8")).not.toMatch(/Date\.now|Math\.random/);
  });

  it("görünür yüzeyler statik logo yolu kullanmaz", () => {
    for (const file of ["src/app/login/page.tsx", "src/components/site/sections.tsx", "src/app/platform/(gate)/giris/page.tsx", "src/app/platform/layout.tsx"]) {
      const src = readFileSync(path.join(ROOT, file), "utf-8");
      expect(src, file).not.toMatch(/BRAND\.logo|\/brand\/logo\.png|\/icon\.png/);
      expect(src, file).toContain("PlatformLogo");
    }
    const layout = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf-8");
    expect(layout).toContain("icons: { icon: brand.iconUrl, apple: brand.appleIconUrl }");
    expect(readFileSync(path.join(ROOT, "src/components/site/app-banner.tsx"), "utf-8")).not.toContain("/icon.png");
  });

  it("varyantlar küçük, kırpılmış ve boyutlu; ikonlar opak kare", async () => {
    const res = await upload(await sampleLogo());
    expect(res.ok).toBe(true);
    const brand = await getPlatformBrand();
    expect(brand.logoWidth / brand.logoHeight).toBeCloseTo(1400 / 1100, 1);
    const fetchBytes = async (u: string) => Buffer.from(await (await GET(url(u))).arrayBuffer());
    const logo = await fetchBytes(brand.logoUrl);
    const icon = await fetchBytes(brand.iconUrl);
    const apple = await fetchBytes(brand.appleIconUrl);
    expect((await sharp(logo).metadata()).width).toBe(512);
    const iconMeta = await sharp(icon).metadata();
    expect([iconMeta.width, iconMeta.height]).toEqual([64, 64]);
    expect((await sharp(apple).metadata()).width).toBe(180);
    expect((await sharp(icon).stats()).isOpaque).toBe(true);
    expect(logo.length + icon.length + apple.length).toBeLessThan(200 * 1024);
  });

  it("sürümlü URL uzun önbellekli, sürümsüz URL değil; güvenlik başlıkları tam", async () => {
    await upload(await sampleLogo());
    const brand = await getPlatformBrand();
    const versioned = await GET(url(brand.logoUrl));
    expect(versioned.headers.get("cache-control")).toContain("immutable");
    expect(versioned.headers.get("x-content-type-options")).toBe("nosniff");
    expect(versioned.headers.get("content-security-policy")).toContain("sandbox");
    const plain = await GET(url("/api/v1/branding/platform-logo"));
    expect(plain.status).toBe(200);
    expect(plain.headers.get("cache-control")).not.toContain("immutable");
    const junk = await GET(url("/api/v1/branding/platform-logo?v=../../etc&variant=x"));
    expect(junk.headers.get("cache-control")).not.toContain("immutable");
  });

  it("baytlar ayar listelerine ve sürüm geçmişine girmez (egress)", async () => {
    await upload(await sampleLogo());
    for (const rows of [await listSettingOverrides(), await listSettingOverrides({ tenantId: PLATFORM_TENANT_ID })]) {
      expect(rows.some((o) => o.scopeType.startsWith("brand_asset:"))).toBe(false);
      expect(JSON.stringify(rows).length).toBeLessThan(5000);
    }
    expect(JSON.stringify((await getSettingOverride("platform", "*", PLATFORM_LOGO_KEY))?.value).length).toBeLessThan(1000);
    // Eski biçimli logo ve büyüyen site içeriği de panel listelerine taşınmaz.
    await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key: "site.page", value: { big: "x".repeat(50_000) }, updatedAt: "2026-10-30T00:00:00.000Z", updatedBy: "x" });
    expect(JSON.stringify(await listSettingOverrides({ tenantId: DEFAULT_TENANT_ID })).length).toBeLessThan(5000);
    expect((await listSettingOverrides()).some((o) => o.key === "site.page" || o.key === PLATFORM_LOGO_KEY)).toBe(false);
    const { listPolicyVersions } = await import("../platform/store-ext");
    expect(JSON.stringify(await listPolicyVersions("platform", PLATFORM_LOGO_KEY)).length).toBeLessThan(2000);
  });

  it("geri alma eski logoyu baytıyla döndürür; sıfırlama varsayılana döner", async () => {
    const { rollbackPolicy } = await import("../platform/policy-versions");
    await upload(await sampleLogo());
    const first = (await getPlatformBrand()).logoUrl;
    await upload(await sampleLogo(1300, 1000));
    await rollbackPolicy(hyper(), "platform", { key: PLATFORM_LOGO_KEY, reason: "Eski logo daha iyi", confirm: true });
    expect((await getPlatformBrand()).logoUrl).toBe(first);
    expect((await GET(url(first))).status).toBe(200);
    await resetPlatformLogo(hyper());
    expect((await getPlatformBrand()).custom).toBe(false);
    expect((await GET(url("/api/v1/branding/platform-logo?variant=icon"))).headers.get("location")).toContain("/icon.png");
  });

  it("eski biçimli kayıt (bayt satırın içinde) kırılmaz", async () => {
    const png = await sampleLogo(64, 64);
    await upsertSettingOverride({
      scopeType: "platform",
      scopeId: "*",
      key: PLATFORM_LOGO_KEY,
      value: { mime: "image/png", dataBase64: png.toString("base64"), sha256: "a".repeat(64), size: png.length, updatedAt: "2026-10-01T00:00:00.000Z", updatedBy: "x" },
      updatedAt: "2026-10-01T00:00:00.000Z",
      updatedBy: "x",
    });
    const brand = await getPlatformBrand();
    expect(brand.iconUrl).toContain("v=aaaaaaaaaaaaaaaa");
    const res = await GET(url(brand.iconUrl));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
    expect((await getPlatformLogo())?.sha256).toBe("a".repeat(64));
  });
});

describe("yükleme güvenliği", () => {
  it("yalnız HYPER_ADMIN yükler", async () => {
    const png = (await sampleLogo(16, 16)).toString("base64");
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT"] as const) {
      const res = await setPlatformLogo(ctx(role), { mime: "image/png", dataBase64: png });
      expect(!res.ok && res.error.code, role).toBe("FORBIDDEN");
    }
  });

  it("SVG, sahte PNG ve bozuk dosya reddedilir; Türkçe neden söylenir", async () => {
    const svg = await setPlatformLogo(hyper(), { mime: "image/svg+xml", dataBase64: Buffer.from("<svg onload=alert(1)>").toString("base64") });
    expect(!svg.ok && svg.error.message).toMatch(/SVG/);
    const fake = await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: Buffer.from("<html>not png</html>").toString("base64") });
    expect(fake.ok).toBe(false);
    const broken = await setPlatformLogo(hyper(), {
      mime: "image/png",
      dataBase64: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString("base64"),
    });
    expect(!broken.ok && broken.error.message).toMatch(/işlenemedi/);
    expect(await getPlatformLogo()).toBeNull();
  });

  it("3 MB üstü reddedilir, 1,1 MB'lık gerçek boyut kabul edilir", async () => {
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3 * 1024 * 1024)]);
    const res = await setPlatformLogo(hyper(), { mime: "image/png", dataBase64: big.toString("base64") });
    expect(!res.ok && res.error.message).toMatch(/3 MB/);
    // Sıkıştırılamayan gürültü dosyası ~1,2 MB eder: eski 200 KB sınırı bunu reddediyordu.
    const noise = Buffer.alloc(700 * 700 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
    const large = await sharp(noise, { raw: { width: 700, height: 700, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(large.length).toBeGreaterThan(1024 * 1024);
    expect((await upload(large)).ok).toBe(true);
  });

  it("kurum logosu etkilenmez: anahtar ve kapsam ayrı", async () => {
    await upload(await sampleLogo());
    const tenantRows = await listSettingOverrides({ tenantId: DEFAULT_TENANT_ID });
    expect(tenantRows.filter((o) => o.scopeType === "tenant" && o.key.includes("logo"))).toEqual([]);
    const sidebar = readFileSync(path.join(ROOT, "src/components/sidebar.tsx"), "utf-8");
    expect(sidebar).not.toContain("getPlatformBrand");
    expect(readdirSync(path.join(ROOT, "src/app")).includes("icon.png")).toBe(false);
  });
});
