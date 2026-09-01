import { describe, it, expect } from "vitest";
import {
  resolveFirstPaymentAdjustment,
  buildFirstPaymentAdjustmentAuditEntry,
} from "../first-payment-adjustment";

describe("resolveFirstPaymentAdjustment", () => {
  it("override yoksa otomatik tutar aynen kullanılır, gerekçe istenmez", () => {
    const res = resolveFirstPaymentAdjustment({ autoSuggestedAmount: 2000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.manualNetAmount).toBe(2000);
      expect(res.result.isManualOverride).toBe(false);
      expect(res.result.reason).toBeUndefined();
      expect(res.result.adjustmentDelta).toBe(0);
    }
  });

  it("manuel tutar otomatikle AYNIYSA override sayılmaz, gerekçe istenmez", () => {
    const res = resolveFirstPaymentAdjustment({ autoSuggestedAmount: 2000, manualNetAmount: 2000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.isManualOverride).toBe(false);
      expect(res.result.reason).toBeUndefined();
    }
  });

  it("11) manuel tutar FARKLI ve gerekçeli: kabul edilir, tam audit alanları üretilir", () => {
    const res = resolveFirstPaymentAdjustment({
      autoSuggestedAmount: 2000,
      manualNetAmount: 1500,
      reason: "Aile maddi zorluk, yönetici onayı",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result).toEqual({
        autoSuggestedAmount: 2000,
        manualNetAmount: 1500,
        adjustmentDelta: -500,
        isManualOverride: true,
        reason: "Aile maddi zorluk, yönetici onayı",
      });
    }
  });

  it("12) manuel tutar farklı ama gerekçe YOKSA reddedilir", () => {
    const res = resolveFirstPaymentAdjustment({ autoSuggestedAmount: 2000, manualNetAmount: 1500 });
    expect(res.ok).toBe(false);
  });

  it("12b) gerekçe yalnız boşluklardan oluşuyorsa reddedilir", () => {
    const res = resolveFirstPaymentAdjustment({
      autoSuggestedAmount: 2000,
      manualNetAmount: 1500,
      reason: "   ",
    });
    expect(res.ok).toBe(false);
  });

  it("negatif veya kesirli tutarlar reddedilir", () => {
    expect(resolveFirstPaymentAdjustment({ autoSuggestedAmount: -1 }).ok).toBe(false);
    expect(resolveFirstPaymentAdjustment({ autoSuggestedAmount: 2000, manualNetAmount: -1, reason: "x" }).ok).toBe(
      false
    );
    expect(
      resolveFirstPaymentAdjustment({ autoSuggestedAmount: 2000, manualNetAmount: 1500.5, reason: "x" }).ok
    ).toBe(false);
  });

  it("gerekçe baştaki/sondaki boşluklardan arındırılır", () => {
    const res = resolveFirstPaymentAdjustment({
      autoSuggestedAmount: 2000,
      manualNetAmount: 2500,
      reason: "  ek ders talebi  ",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.reason).toBe("ek ders talebi");
  });
});

describe("buildFirstPaymentAdjustmentAuditEntry", () => {
  it("audit girişi eski/yeni tutar, fark, gerekçe, kullanıcı ve tarihi taşır", () => {
    const resolved = resolveFirstPaymentAdjustment({
      autoSuggestedAmount: 2000,
      manualNetAmount: 1800,
      reason: "Erken ödeme indirimi",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const entry = buildFirstPaymentAdjustmentAuditEntry(resolved.result, {
      tenantId: "t1",
      studentId: "st1",
      contractId: "c1",
      adjustedBy: "u1",
      now: new Date("2026-09-15T10:00:00.000Z"),
    });
    expect(entry).toEqual({
      tenantId: "t1",
      studentId: "st1",
      contractId: "c1",
      paymentId: undefined,
      autoSuggestedAmount: 2000,
      manualNetAmount: 1800,
      adjustmentDelta: -200,
      reason: "Erken ödeme indirimi",
      adjustedBy: "u1",
      adjustedAt: "2026-09-15T10:00:00.000Z",
    });
  });
});
