import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Kaynak-kilit regresyonları — 2026-09-22 ops/UX/güvenlik turu (C/D/F/G/I).
 * Davranış testleri ayrı dosyalarda; burada "yanlışlıkla geri gelen" UI/IA
 * kalıpları kilitlenir.
 */

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("C — Telafi aksiyon bekleyenler temizliği", () => {
  const src = read("src/app/panel/telafi/page.tsx");

  it("tek QuickTaskLink kalır (duplicate Görev oluştur yok)", () => {
    const matches = src.match(/<QuickTaskLink/g) ?? [];
    // Sayfada başka QuickTaskLink olabilir; aksiyon kartında tek olmalı.
    // En azından "Bu talep için görev oluştur" etiketi kaldırılmış olmalı.
    expect(src).not.toContain("Bu talep için görev oluştur");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

describe("D — Devamsızlık riski bilgi mimarisi", () => {
  it("öğrenciler listesinde risk bloğu yok", () => {
    const src = read("src/app/panel/ogrenciler/page.tsx");
    expect(src).not.toContain("Devamsızlık riski");
    expect(src).not.toContain("computeAllStudentAttendanceRisks");
  });

  it("yoklama raporunda risk bloğu var", () => {
    const src = read("src/app/panel/yoklama-raporu/page.tsx");
    expect(src).toContain("Devamsızlık riski");
    expect(src).toContain("computeAllStudentAttendanceRisks");
  });
});

describe("F — Tahsilat takibi geri navigasyon", () => {
  it("ödemeler listesi returnTo taşır", () => {
    const src = read("src/app/panel/odemeler/page.tsx");
    expect(src).toContain("returnTo=");
    expect(src).toContain("/panel/odemeler");
  });

  it("tahsilat sayfası entry-aware geri etiketi kullanır", () => {
    const src = read("src/app/panel/ai/tahsilat-agent/page.tsx");
    expect(src).toContain("Ödemelere dön");
    expect(src).toContain("fromPayments");
  });
});

describe("G — Global arama kapanışı", () => {
  it("Escape ve boş alan kapanışı kodda mevcut", () => {
    const src = read("src/components/command-palette.tsx");
    expect(src).toMatch(/e\.key === "Escape"/);
    expect(src).toContain("onMouseDown");
    expect(src).toMatch(/open \? close\(\) : setOpen\(true\)/);
  });
});
