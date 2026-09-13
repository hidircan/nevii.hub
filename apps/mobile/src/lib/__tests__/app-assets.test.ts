import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

/**
 * Store build ön koşulu: icon / adaptive icon / splash app.json'da bağlı ve dosyalar
 * gerçekten var. Kaynak, repodaki kanonik NeviiHub favicon'u (`src/app/icon.png`) —
 * yeni/uydurma logo yok. (`public/brand/logo.png` KULLANILMADI: şeffaflık yerine
 * piksellere gömülü damalı desen içeriyor.)
 */
const MOBILE = path.join(__dirname, "../../..");
const CANONICAL = path.join(MOBILE, "../../src/app/icon.png");
const expo = JSON.parse(readFileSync(path.join(MOBILE, "app.json"), "utf8")).expo;

function png(rel: string) {
  const buf = readFileSync(path.join(MOBILE, rel));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  // IHDR: genişlik 16, yükseklik 20, renk tipi 25 (2 = RGB, 6 = RGBA)
  return { buf, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("mobil uygulama ikon ve splash asset'leri", () => {
  it("icon 1024×1024, alfa kanalsız (App Store şartı) ve kanonik favicon ile byte olarak aynı", () => {
    const icon = png(expo.icon);
    expect([icon.width, icon.height]).toEqual([1024, 1024]);
    expect(icon.colorType).not.toBe(6);
    expect(sha(icon.buf)).toBe(sha(readFileSync(CANONICAL)));
  });

  it("Android adaptive icon ön planı var, 1024×1024, arka plan rengi tanımlı", () => {
    const fg = png(expo.android.adaptiveIcon.foregroundImage);
    expect([fg.width, fg.height]).toEqual([1024, 1024]);
    expect(expo.android.adaptiveIcon.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("splash görseli var ve arka plan rengi tanımlı", () => {
    png(expo.splash.image);
    expect(expo.splash.resizeMode).toBe("contain");
    expect(expo.splash.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("bundle/package kimlikleri değişmedi", () => {
    expect(expo.ios.bundleIdentifier).toBe("com.neviihub.mobile");
    expect(expo.android.package).toBe("com.neviihub.mobile");
  });
});
