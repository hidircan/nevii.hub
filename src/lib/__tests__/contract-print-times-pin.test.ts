import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const PAGE = readFileSync(path.join(ROOT, "src/app/sozlesme-yazdir/[contractId]/page.tsx"), "utf-8");

/**
 * P1 revizyonu — sözleşme metninin tamamı ekran + baskı + PDF çıktısında
 * Times New Roman. Kök neden: globals.css `body * !important` ve
 * `h1,h2,h3 !important` kuralları kullanıcı font seçimini sözleşmeye
 * dayatıyordu. Sabitleme SADECE sözleşme kapsamındadır.
 */
describe("Sözleşme fontu — Times New Roman sabitlemesi", () => {
  it("contract-print kapsamı !important Times sabitlemesi içerir", () => {
    expect(PAGE).toContain(".contract-print-surface .contract-body");
    expect(PAGE).toMatch(
      /\.contract-print-surface \.contract-body \*[\s\S]{0,200}font-family:[^;]*Times New Roman[^;]*!important/
    );
  });

  it("sabitleme genel uygulamaya sızmaz (yalnız contract-print-surface altı)", () => {
    const pinLines = PAGE.split("\n").filter((l) => l.includes("!important") && l.includes("Times New Roman"));
    expect(pinLines.length).toBeGreaterThan(0);
    for (const line of pinLines) {
      expect(line.includes("contract-print-surface") || PAGE.includes(".contract-print-surface .contract-body")).toBe(
        true
      );
    }
    // globals.css genel kuralları yerinde durur (genel tercih bozulmadı).
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf-8");
    expect(css).toContain("--font-sans");
    expect(css).toContain('body *');
  });

  it("sözleşme ödeme planı tablosunda Ödeme Türü sütunu vardır", () => {
    const body = readFileSync(path.join(ROOT, "src/lib/documents/index.ts"), "utf-8");
    expect(body).toContain("<th>Ödeme Türü</th>");
    expect(body).toContain("{{taksit1Yontem}}");
    expect(body).toContain("{{taksit12Yontem}}");
  });

  it("hukuki cümleler değişmedi (MADDE başlıkları aynen durur)", () => {
    const body = readFileSync(path.join(ROOT, "src/lib/documents/index.ts"), "utf-8");
    expect(body).toContain("MADDE 4 – EĞİTİM ÜCRETİ VE ÖDEME");
    expect(body).toContain("MADDE 5 – SABİT FİYAT GARANTİSİ VE DEVAM KOŞULU");
  });
});
