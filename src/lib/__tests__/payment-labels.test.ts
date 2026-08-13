import { describe, it, expect } from "vitest";
import {
  formatPaymentCollectionSummary,
  paymentMethodLabelTr,
  normalizePaymentMethodEnum,
} from "../utils";

describe("ödeme yöntemi Türkçe etiketleri", () => {
  it("enum ve legacy Türkçe değerleri map eder", () => {
    expect(paymentMethodLabelTr("cash")).toBe("Nakit");
    expect(paymentMethodLabelTr("transfer")).toBe("Havale / EFT");
    expect(paymentMethodLabelTr("credit_card")).toBe("Kredi Kartı");
    expect(paymentMethodLabelTr("Havale")).toBe("Havale / EFT");
    expect(paymentMethodLabelTr(undefined)).toBe("—");
  });

  it("kanonik enum normalize eder", () => {
    expect(normalizePaymentMethodEnum("nakit")).toBe("cash");
    expect(normalizePaymentMethodEnum("Havale")).toBe("transfer");
    expect(normalizePaymentMethodEnum("credit_card")).toBe("credit_card");
  });

  it("tahsilat özeti yalnız paidAt kullanır", () => {
    const s = formatPaymentCollectionSummary({
      paidAt: "2026-08-13T11:12:00.000Z",
      amount: 2500,
      method: "transfer",
      collectorName: "Ayşe Demir",
    });
    expect(s).toContain("Ayşe Demir");
    expect(s).toContain("Havale / EFT");
    expect(s).toMatch(/tahsil edildi/);
    expect(formatPaymentCollectionSummary({ amount: 100, method: "cash" })).toBeNull();
  });
});
