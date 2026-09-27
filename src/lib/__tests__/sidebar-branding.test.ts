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

  /**
   * 9. tur (2026-09-27, owner) — menüde kutulu/arka planlı logo KALDIRILDI; marka
   * yalnız tipografi (Gloock). Önerilen şeffaf "icon 2.png" alfa kanalsız olduğu için
   * kullanılmadı. Favicon/login logosu (aşağıdaki asset testleri) değişmedi.
   */
  it("menüde logo görseli yok; marka Gloock (.brand-mark) tipografisi", () => {
    expect(CODE).not.toMatch(/src=\{BRAND\.logoMarkPath\}/);
    expect(CODE).not.toMatch(/from "next\/image"/);
    expect(CODE).toMatch(/className="brand-mark[^"]*"/);
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf-8");
    expect(css).toMatch(/\.brand-mark \{\s*font-family: var\(--font-gloock\), Gloock, Georgia/);
  });

  it("Gloock tek ağırlıklı — sahte kalınlaştırma yok", () => {
    expect(CODE).not.toMatch(/brand-mark[^"]*font-(extra)?bold/);
  });

  it("collapsed modda kutusuz monogram ve erişilebilir isim", () => {
    expect(CODE).toMatch(/\{collapsed \? \([\s\S]{0,300}brand-mark[\s\S]{0,200}N\s*<\/span>/);
    expect(CODE).toMatch(/role: "img", "aria-label": BRAND\.name/);
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
