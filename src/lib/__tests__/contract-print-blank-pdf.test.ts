import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { CONTRACT_PRINT_PALETTE, CONTRACT_PRINT_PINNED_VARS } from "../contract-print-theme";
import { contrastRatio, relativeLuminance } from "../attendance-calendar";

/**
 * P0 UAT REGRESYONU (2026-09-07) — "PDF tamamen boş beyaz sayfa".
 *
 * Kök neden ölçüldü: koyu tema profilinde baskı yüzeyinin zemini koyu
 * (rgb(23,23,26)), metni açık (rgba(245,241,232,.96)) çözülüyordu. Yazdırma
 * diyaloğunda arka plan grafikleri VARSAYILAN OLARAK KAPALI olduğu için koyu
 * zemin basılmıyor, kağıt beyaz kalıyor, beyaz metin görünmüyordu.
 * Ölçülen mürekkep oranı: hatalı %0.39 → düzeltilmiş %6.12.
 *
 * Bu dosya, kök nedeni koda sabitler. Gerçek tarayıcı/PDF doğrulaması ayrıca
 * `scripts/verify-contract-print.mjs` ile yapılır (Playwright + çalışan sunucu
 * gerektirdiği için `npm test` kapsamında değildir).
 */
const PAGE_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../../app/sozlesme-yazdir/[contractId]/page.tsx"),
  "utf-8"
);

describe("Sözleşme baskı paleti — kağıtta okunur olmak zorunda", () => {
  it("zemin AÇIK, metin KOYU", () => {
    expect(relativeLuminance(CONTRACT_PRINT_PALETTE.surface)).toBeGreaterThan(0.8);
    expect(relativeLuminance(CONTRACT_PRINT_PALETTE.text)).toBeLessThan(0.1);
  });

  it("metin/zemin kontrastı WCAG AA'yı (4.5:1) geçer", () => {
    expect(
      contrastRatio(CONTRACT_PRINT_PALETTE.text, CONTRACT_PRINT_PALETTE.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("ikincil (muted) metin de AA'yı geçer", () => {
    expect(
      contrastRatio(CONTRACT_PRINT_PALETTE.textMuted, CONTRACT_PRINT_PALETTE.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Sözleşme baskı sayfası — tema sızıntısına karşı kilit", () => {
  it("baskı yüzeyi TÜM tema değişkenlerini kendi paletine sabitler", () => {
    for (const cssVar of CONTRACT_PRINT_PINNED_VARS) {
      expect(PAGE_SRC).toContain(`${cssVar}: \${P.`);
    }
  });

  it("yüzey zemini ve metni paletten gelir, tema değişkeninden DEĞİL", () => {
    const surfaceBlock = PAGE_SRC.slice(
      PAGE_SRC.indexOf(".contract-print-surface {"),
      PAGE_SRC.indexOf(".contract-print-surface h1")
    );
    expect(surfaceBlock).toContain("background: ${P.surface}");
    expect(surfaceBlock).toContain("color: ${P.text}");
    expect(surfaceBlock).toContain("color-scheme: light");
  });

  it("başlıklar/th rengi açıkça sabitlenir (miras almazlar, tema kuralı yener)", () => {
    expect(PAGE_SRC).toMatch(/\.contract-print-surface h1,[\s\S]{0,200}color: \$\{P\.text\}/);
  });

  it("@media print bloğunda zemin beyaz, metin koyu olmaya ZORLANIR", () => {
    const printBlock = PAGE_SRC.slice(PAGE_SRC.indexOf("@media print"));
    expect(printBlock).toContain("background: ${P.surface}");
    expect(printBlock).toContain("color: ${P.text}");
  });

  it("dış sarmalayıcı baskıda tema yüzeyine DEĞİL beyaza düşer", () => {
    // Regresyon: print:bg-[var(--color-surface)] koyu temada siyah kağıt demekti.
    expect(PAGE_SRC).toContain("print:bg-white");
    expect(PAGE_SRC).not.toContain("print:bg-[var(--color-surface)]");
  });
});
