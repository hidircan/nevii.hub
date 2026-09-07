import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * P0 UAT REGRESYONU (2026-09-07) — "her ekran ilk açılışta yavaş".
 *
 * ÖLÇÜLDÜ (boş cache, gerçek Chromium): her panel route'u açılışta 7 font
 * dosyası indiriyordu, TOPLAM 4.747 KB. Bunun 4.311 KB'ı iki ham TTF variable
 * font'tu (RobotoSerif 1.954 KB + italik 2.357 KB), `next/font/local` ile
 * public/fonts'tan servis ediliyordu. Aynı sayfada JS 179 KB, CSS 21 KB —
 * yani ilk açılışın BASKIN maliyeti fontlardı ve TÜM route'larda aynıydı.
 *
 * Düzeltme: iki aile de `next/font/google`'a taşındı (aynı build-time
 * self-host, ek olarak latin alt kümesi + woff2). Ölçüm: 4.747 KB → 339 KB.
 *
 * Bu test maliyeti geri getirecek iki değişikliği yakalar: ham font
 * ikililerinin repoya dönmesi ve `next/font/local`'a geri dönülmesi.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const LAYOUT = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf-8");
/** Yorumlar hariç kod — yasaklı kalıp açıklama metninde geçebilir (bkz. store-mode-parity.test.ts). */
const LAYOUT_CODE = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** woff2 subset'ler 35-84 KB ölçüldü; 200 KB üstü "ham/subset edilmemiş" demektir. */
const MAX_FONT_FILE_BYTES = 200 * 1024;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

describe("Font yükü bütçesi — ilk açılış maliyeti", () => {
  it("layout `next/font/local` KULLANMAZ (subset/woff2 dönüşümünü atlar)", () => {
    expect(LAYOUT_CODE).not.toContain("next/font/local");
    expect(LAYOUT_CODE).not.toContain("localFont(");
  });

  it("dört font ailesi de `next/font/google` üzerinden gelir", () => {
    expect(LAYOUT_CODE).toMatch(/from "next\/font\/google"/);
    for (const family of ["Inter", "Noto_Sans", "Playfair_Display", "Roboto_Serif"]) {
      expect(LAYOUT_CODE).toContain(family);
    }
  });

  it("public/ altında 200 KB üstü font ikilisi YOK", () => {
    const heavy = walk(path.join(ROOT, "public"))
      .filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))
      .map((f) => ({ f: path.relative(ROOT, f), kb: Math.round(statSync(f).size / 1024) }))
      .filter((x) => x.kb * 1024 > MAX_FONT_FILE_BYTES);
    expect(heavy).toEqual([]);
  });
});
