import { describe, expect, it, vi } from "vitest";
import { goBack, listFallback } from "../navigation-rules";

describe("goBack", () => {
  it("yığında önceki ekran varsa back()", () => {
    const router = { back: vi.fn(), canGoBack: () => true, replace: vi.fn() };
    goBack(router, "/(parent)/dersler");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("yığın boşsa güvenli fallback'e replace()", () => {
    const router = { back: vi.fn(), canGoBack: () => false, replace: vi.fn() };
    goBack(router, "/(parent)/dersler");
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/(parent)/dersler");
  });

  it("fallback verilmezse rol evi (/)", () => {
    const router = { back: vi.fn(), canGoBack: () => false, replace: vi.fn() };
    goBack(router);
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});

describe("listFallback", () => {
  it("persona kökü + segment birleştirir", () => {
    expect(listFallback("/(parent)", "dersler")).toBe("/(parent)/dersler");
    expect(listFallback("/(student)", "odemeler")).toBe("/(student)/odemeler");
  });

  it("kök çözülemezse çift eğik çizgi üretmez", () => {
    expect(listFallback("/", "dersler")).toBe("/");
  });
});
