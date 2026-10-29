import { describe, it, expect } from "vitest";
import {
  applyFixedDiscount,
  applyPercentDiscount,
  formatMinorTR,
  monthlyEquivalentOfYearly,
} from "../saas-billing/types";

describe("saas-billing minor-unit para", () => {
  it("formatMinorTR kuruşu Türkçe formatlar", () => {
    expect(formatMinorTR(0)).toBe("0,00 ₺");
    expect(formatMinorTR(1)).toBe("0,01 ₺");
    expect(formatMinorTR(123456)).toBe("1.234,56 ₺");
  });

  it("tamsayı olmayan/negatif tutarı reddeder (float yok)", () => {
    expect(() => formatMinorTR(10.5)).toThrow();
    expect(() => formatMinorTR(-1)).toThrow();
    expect(() => formatMinorTR(NaN)).toThrow();
  });

  it("yüzde indirim tamsayı aritmetiğiyle aşağı yuvarlanır", () => {
    expect(applyPercentDiscount(10000, 20)).toBe(8000);
    expect(applyPercentDiscount(100, 33)).toBe(67);
    expect(applyPercentDiscount(1, 50)).toBe(0);
    expect(() => applyPercentDiscount(100, 101)).toThrow();
  });

  it("sabit indirim negatife düşmez", () => {
    expect(applyFixedDiscount(5000, 1000)).toBe(4000);
    expect(applyFixedDiscount(500, 1000)).toBe(0);
  });

  it("yıllık aylık eşdeğer yalnızca gösterimdir (toplam değişmez)", () => {
    expect(monthlyEquivalentOfYearly(120000)).toBe(10000);
    expect(monthlyEquivalentOfYearly(100)).toBe(8);
  });
});
