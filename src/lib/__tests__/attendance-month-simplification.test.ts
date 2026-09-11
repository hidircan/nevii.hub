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
});
