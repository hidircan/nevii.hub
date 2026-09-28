import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const PANEL = readFileSync(path.join(ROOT, "src/components/attendance-calendar-panel.tsx"), "utf-8");
/** Yorumlar hariç kod — açıklama metninde eski metin geçebilir. */
const CODE = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

/**
 * P1 revizyonu — yoklama takvimi ay kutuları sadeleştirildi:
 * - "Sözleşme planı: NP-…" açıklama satırı kaldırıldı,
 * - "(bilgi)" ders sayacı satırı kaldırıldı.
 * Tutar/ödenen/kalan/durum özeti + tahsilat aksiyonları aynen korunur;
 * veri ilişkisi/hesaplama değişmedi (yalnız görsel metin).
 */
describe("Yoklama takvimi ay kutusu sadeleştirmesi", () => {
  it("'Sözleşme planı:' açıklama metni render edilmez", () => {
    expect(CODE).not.toContain("Sözleşme planı:");
  });

  it("'(bilgi)' açıklama metni render edilmez", () => {
    expect(CODE).not.toContain("(bilgi)");
  });

  it("finansal özet (tutar/ödenen/kalan/durum) hâlâ gösterilir", () => {
    expect(CODE).toContain("plan.amount");
    expect(CODE).toContain("plan.paidAmount");
    expect(CODE).toContain("plan.remaining");
    expect(CODE).toContain("PLAN_STATUS_LABEL[plan.status]");
  });

  it("tahsilat aksiyonları (tutar girişi/kaydet) hâlâ mevcuttur", () => {
    expect(CODE).toContain("MonthPlanSummary");
    expect(CODE).toContain("amounts[key]");
  });

  it("10. tur iş #7 — kompakt başlık: tutar+tarih bir satır, şekil+not+kaydet bir satır", () => {
    // 1. satır: iki sütunlu grid (tutar + tarih).
    expect(CODE).toMatch(/grid grid-cols-2 gap-1\.5/);
    // 2. satır: sarma YOK (flex, wrap yok) — şekil + esnek not + sabit Kaydet.
    expect(CODE).toMatch(/<div className="flex items-center gap-1\.5">/);
    expect(CODE).not.toContain('<div className="flex flex-wrap items-center gap-1">');
    // Tüm alanlar + erişilebilirlik korunur.
    for (const key of ["amounts[key]", "dueDates[key]", "methods[key]", "collectionNotes[key]", "onSaveAmount(key)"]) {
      expect(CODE).toContain(key);
    }
    expect(CODE).toContain("tutar\u0131");
    expect(CODE).toContain("ödeme tarihi");
    expect(CODE).toContain("ödeme \u015fekli");
    expect(CODE).toContain("tahsilat notu");
    // Dar ekranda taşma yok: esnek alanlarda min-w-0.
    expect(CODE).toContain("min-w-0 flex-1");
    // Açıklama paragrafı kalktı; bilgi Kaydet düğmesinin başlık/ipucunda.
    expect(CODE).not.toContain("Kaydet, bu ay\u0131n \u00f6demesini");
    expect(CODE).toContain("tahsil edilmi\u015f (\u00d6dendi) olarak kaydeder");
  });
});
