import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  CONTRACT_PRINT_PALETTE,
  CONTRACT_PRINT_PINNED_VARS,
  printSurfaceCss,
} from "../contract-print-theme";
import { contrastRatio, relativeLuminance } from "../attendance-calendar";

/**
 * P0 REGRESYONU (2026-09-11) — KVKK/evrak + makbuz "boş beyaz sayfa".
 *
 * KÖK NEDEN (sözleşmedeki 2026-09-07 hatasıyla AYNI sınıf): bu sayfalar
 * tema değişkenine (`text-[var(--color-text)]` / `print:bg-[var(--color-surface)]`)
 * doğrudan bağlıydı; koyu temada zemin koyu + metin açık çözülüyor, yazdırma
 * diyaloğunda "arka plan grafikleri" kapalı olduğundan kağıt beyaz kalıp
 * metin görünmez oluyordu. Düzeltme: ortak `printSurfaceCss` helper'ı.
 *
 * Gerçek tarayıcı/PDF doğrulaması bu ortamda MÜMKÜN DEĞİL (Chromium/
 * Playwright kurulu değil, ağ yok) — raporlandı. Bu dosya kök nedeni koda
 * sabitler: palet kontrastı + helper yapısı + sayfaların helper'ı kullanması.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const EVRAK_SRC = readFileSync(path.join(ROOT, "src/app/evrak-yazdir/[documentId]/page.tsx"), "utf-8");
const MAKBUZ_SRC = readFileSync(path.join(ROOT, "src/app/makbuz/[paymentId]/page.tsx"), "utf-8");
const SOZLESME_SRC = readFileSync(path.join(ROOT, "src/app/sozlesme-yazdir/[contractId]/page.tsx"), "utf-8");

describe("ortak baskı yüzeyi helper'ı", () => {
  it("zemin AÇIK, metin KOYU ve kontrast AA (4.5:1) üstü", () => {
    expect(relativeLuminance(CONTRACT_PRINT_PALETTE.surface)).toBeGreaterThan(0.8);
    expect(relativeLuminance(CONTRACT_PRINT_PALETTE.text)).toBeLessThan(0.1);
    expect(contrastRatio(CONTRACT_PRINT_PALETTE.text, CONTRACT_PRINT_PALETTE.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("TÜM tema değişkenlerini sabitler + açık zemin/metin + color-scheme: light", () => {
    const css = printSurfaceCss("x-surface");
    for (const v of CONTRACT_PRINT_PINNED_VARS) {
      expect(css).toContain(`${v}:`);
    }
    expect(css).toContain(`.x-surface {`);
    expect(css).toContain(`background: ${CONTRACT_PRINT_PALETTE.surface}`);
    expect(css).toContain(`color: ${CONTRACT_PRINT_PALETTE.text}`);
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("@media print");
  });

  it("sözleşme sayfasındaki tarihsel sabitleme ile EŞDEĞER paleti kullanır", () => {
    // Sözleşme sayfası kendi satır-içi bloğunu korur; helper aynı P.* değerlerini üretmeli.
    for (const cssVar of CONTRACT_PRINT_PINNED_VARS) {
      expect(SOZLESME_SRC).toContain(`${cssVar}: \${P.`);
    }
    const css = printSurfaceCss("contract-print-surface");
    expect(css).toContain(`--color-text: ${CONTRACT_PRINT_PALETTE.text}`);
    expect(css).toContain(`--color-surface: ${CONTRACT_PRINT_PALETTE.surface}`);
  });
});

describe("evrak (KVKK) baskı sayfası — tema sızıntısına karşı kilit", () => {
  it("ortak helper'ı kullanır", () => {
    expect(EVRAK_SRC).toContain("printSurfaceCss");
    expect(EVRAK_SRC).toContain("doc-print-surface");
  });

  it("yazdırma zemini tema değişkeninden DEĞİL, beyazdan gelir", () => {
    expect(EVRAK_SRC).toContain("print:bg-white");
    expect(EVRAK_SRC).not.toContain("print:bg-[var(--color-surface)]");
  });

  it("içerik print anında DOM'dadır (koşullu render yok) ve gizleyen print kuralı yok", () => {
    expect(EVRAK_SRC).toContain("dangerouslySetInnerHTML");
    expect(EVRAK_SRC).not.toMatch(/print:hidden[\s\S]{0,200}doc-print-surface/);
  });

  it("kullanıcıya 'PDF olarak kaydet' akışı açıklanır (sahte download yok)", () => {
    expect(EVRAK_SRC).toContain("PDF olarak kaydet");
    expect(EVRAK_SRC).not.toMatch(/jsPDF|html2canvas|html-to-image/);
  });
});

describe("makbuz baskı sayfası — tema sızıntısına karşı kilit", () => {
  it("ortak helper'ı kullanır", () => {
    expect(MAKBUZ_SRC).toContain("printSurfaceCss");
    expect(MAKBUZ_SRC).toContain("doc-print-surface");
  });

  it("yazdırma zemini tema değişkeninden DEĞİL, beyazdan gelir", () => {
    expect(MAKBUZ_SRC).toContain("print:bg-white");
    expect(MAKBUZ_SRC).not.toContain("print:bg-[var(--color-surface)]");
  });
});
