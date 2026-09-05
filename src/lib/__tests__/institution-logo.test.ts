import { describe, it, expect } from "vitest";
import { sanitizeLogoUrl, institutionLogoHtml, prependInstitutionLogo, toLogoDataUrl } from "../institution-logo";

describe("institution-logo", () => {
  it("https URL kabul eder, javascript reddeder", () => {
    expect(sanitizeLogoUrl("https://okul.example/logo.png")).toBe("https://okul.example/logo.png");
    expect(sanitizeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeLogoUrl('<img src=x onerror=alert(1)>')).toBeNull();
  });

  it("geçerli data-URI kabul eder", () => {
    const url = toLogoDataUrl("image/png", "aaaabbbb");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(sanitizeLogoUrl(url)).toBe(url);
  });

  it("HTML bloğu üretir ve ikinci kez eklemez", () => {
    const html = institutionLogoHtml("https://okul.example/logo.png", "Test Okul");
    expect(html).toContain("data-institution-logo");
    expect(html).toContain("https://okul.example/logo.png");
    const twice = prependInstitutionLogo(html + "<p>sözleşme</p>", "https://okul.example/logo.png", "Test Okul");
    expect(twice.split("data-institution-logo").length - 1).toBe(1);
  });

  it("P0 (2026-09-05) — ortalanmış, KIRPILMAYAN, oranı bozulmayan logo: sabit kutu değil TAVAN (max-height/max-width) verilir", () => {
    const html = institutionLogoHtml("https://okul.example/logo.png", "Test Okul");
    expect(html).toContain("text-align:center");
    expect(html).toContain("object-fit:contain");
    // `height:auto` + `max-height` → kırpma/daraltma yok, doğal oran korunur.
    expect(html).toContain("height:auto");
    expect(html).toMatch(/max-height:\s*96px/);
    // Mobilde taşmaz.
    expect(html).toContain("max-width:100%");
    // Banner/hero DEĞİL — sabit üç haneli bir yükseklik asla yazılmaz.
    expect(html).not.toMatch(/[^-]height:\s*\d{3,}px/);
  });

  it("P0 (2026-09-05) — koyu logolar koyu temada/baskıda kaybolmasın diye beyaz güvenli alan kartı taşır", () => {
    const html = institutionLogoHtml("https://okul.example/logo.png", "Test Okul");
    expect(html).toContain("background:#ffffff");
    expect(html).toContain("print-color-adjust:exact");
  });

  it("regresyon (2026-09-05) — img'in KENDİSİ display:block + margin:0 auto taşır (Tailwind preflight img{display:block} altında bile ortalanır, yalnız parent text-align'ına GÜVENMEZ)", () => {
    const html = institutionLogoHtml("https://okul.example/logo.png", "Test Okul");
    const imgTagMatch = html.match(/<img[^>]*>/);
    expect(imgTagMatch).not.toBeNull();
    const imgTag = imgTagMatch![0];
    expect(imgTag).toContain("display:block");
    expect(imgTag).toContain("margin:0 auto");
  });

  it("P0-E — geçerli bir logo YOKSA (null/boş/güvensiz) render KIRILMAZ, kurum adı METİN olarak gösterilir", () => {
    const noneHtml = institutionLogoHtml(null, "Test Okul");
    expect(noneHtml).toContain("data-institution-logo");
    expect(noneHtml).not.toContain("<img");
    expect(noneHtml).toContain("Test Okul");

    const emptyHtml = institutionLogoHtml("", "Test Okul");
    expect(emptyHtml).not.toContain("<img");
    expect(emptyHtml).toContain("Test Okul");

    const unsafeHtml = institutionLogoHtml("javascript:alert(1)", "Test Okul");
    expect(unsafeHtml).not.toContain("<img");
    expect(unsafeHtml).toContain("Test Okul");
  });

  it("hem logo hem kurum adı yoksa (uç durum) boş döner — hiçbir zaman kırılmaz", () => {
    expect(institutionLogoHtml(null, "")).toBe("");
  });
});
