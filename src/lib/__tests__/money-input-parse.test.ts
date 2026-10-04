import { describe, expect, it } from "vitest";
import { parseAmountInput, parseMoneyInput } from "../amount-input";

describe("parseMoneyInput — Türkçe tam TL tutar girdisi (2026-10-04)", () => {
  it("boş ile gerçek sıfır ayrıdır", () => {
    expect(parseMoneyInput("")).toEqual({ kind: "empty" });
    expect(parseMoneyInput("   ")).toEqual({ kind: "empty" });
    expect(parseMoneyInput("0")).toEqual({ kind: "ok", value: 0 });
  });

  it.each([
    ["1250", 1250],
    ["1.250", 1250],
    ["12.500.000", 12500000],
    ["1.250,00", 1250],
    ["1250,0", 1250],
    ["1250.00", 1250],
    ["₺1.250 TL", 1250],
    ["1,250.00", 1250],
    ["007", 7],
  ])("%s → %d", (raw, value) => {
    expect(parseMoneyInput(raw)).toEqual({ kind: "ok", value });
  });

  it("kuruşlu tutar sessizce yuvarlanmaz, açık hata döner", () => {
    const r = parseMoneyInput("1.250,50");
    expect(r.kind).toBe("error");
    expect(parseMoneyInput("1250.5").kind).toBe("error");
  });

  it("anlamsız biçim hata verir", () => {
    expect(parseMoneyInput("1,2,3").kind).toBe("error");
    expect(parseMoneyInput("abc").kind).toBe("error");
    expect(parseMoneyInput("1,234").kind).toBe("error");
  });

  it("parseAmountInput Türkçe binlik ayıracı okur (eskiden 1.250,00 → 125000 oluyordu)", () => {
    expect(parseAmountInput("1.250,00")).toBe(1250);
    expect(parseAmountInput("")).toBeNull();
  });
});
