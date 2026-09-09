import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { BRAND } from "../brand";

/**
 * P0 UAT (2026-09-08) — sidebar üstünde "NH" monogramı yerine kurumun
 * GERÇEK ikonu + "NeviiHub" marka metni.
 *
 * Kullanılan asset `BRAND.logoMarkPath` (= /brand/logo.png) ve bu dosya
 * `src/app/icon.png` ile BYTE OLARAK AYNIDIR — yani favicon ile aynı görsel.
 * Yeni/rastgele bir logo üretilmedi. Favicon/PWA/login logosu değiştirilmedi.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SIDEBAR = readFileSync(path.join(ROOT, "src/components/sidebar.tsx"), "utf-8");
const CODE = SIDEBAR.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("Sidebar markası", () => {
  it("sabit 'NH' monogramı KALDIRILDI", () => {
    expect(CODE).not.toMatch(/>\s*NH\s*</);
  });

  it("marka ikonu BRAND.logoMarkPath'ten gelir (uydurma yol yok)", () => {
    expect(CODE).toMatch(/src=\{BRAND\.logoMarkPath\}/);
    expect(CODE).toMatch(/from "next\/image"/);
  });

  it("marka metni BRAND.name'dir", () => {
    expect(CODE).toContain("{BRAND.name}");
    expect(BRAND.name).toBe("NeviiHub");
  });

  it("collapsed modda yalnız ikon kalır ve erişilebilir isim taşır", () => {
    // Metin yalnız açık modda render edilir.
    expect(CODE).toMatch(/\{!collapsed \? \([\s\S]{0,400}\{BRAND\.name\}/);
    expect(CODE).toMatch(/role: "img", "aria-label": BRAND\.name/);
  });

  it("ikon boyutu collapsed/açık moda göre değişir (retina srcset next/image'den)", () => {
    expect(CODE).toMatch(/width=\{collapsed \? 28 : 32\}/);
    expect(CODE).toMatch(/height=\{collapsed \? 28 : 32\}/);
  });

  it("asset yoksa kırık görsel değil metin kısaltması gösterilir", () => {
    expect(CODE).toMatch(/BRAND\.logoMarkPath \? \(/);
    expect(CODE).toMatch(/BRAND\.name\.slice\(0, 2\)/);
  });
});

describe("Marka asset'i — mevcut icon.png ile aynı dosya", () => {
  it("public/brand/logo.png ve src/app/icon.png BYTE OLARAK aynıdır", () => {
    expect(sha(path.join(ROOT, "public/brand/logo.png"))).toBe(sha(path.join(ROOT, "src/app/icon.png")));
  });

  it("BRAND.logoMarkPath gerçekten var olan bir dosyaya işaret eder", () => {
    expect(BRAND.logoMarkPath).toBeTruthy();
    const file = path.join(ROOT, "public", BRAND.logoMarkPath!.replace(/^\//, ""));
    expect(statSync(file).size).toBeGreaterThan(0);
  });
});
