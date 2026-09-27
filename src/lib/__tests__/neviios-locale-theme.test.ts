import { describe, expect, it } from "vitest";
import { getPublicAppBaseUrl } from "../email/config";
import { withLogoVersion } from "../institution-logo";
import {
  formatInLocale,
  formatNumberInLocale,
  institutionNameMismatch,
  passwordResetMail,
  pickTenantLanguage,
  terminalShellByDefault,
} from "../i18n/copy";

describe("kurum dili ve NeviiOS kabuğu", () => {
  it("tenant override başka kurumun dilini değiştirmez", () => {
    const a = pickTenantLanguage({ overrideScope: "tenant", overrideValue: "en", tenantLanguage: "tr" });
    const b = pickTenantLanguage({ overrideScope: "platform", overrideValue: "en", tenantLanguage: "tr" });
    expect(a).toBe("en");
    expect(b).toBe("tr");
  });

  it("kayıtlı tema varken terminal varsayılanı uygulanmaz", () => {
    expect(terminalShellByDefault(undefined)).toBe(true);
    expect(terminalShellByDefault("")).toBe(true);
    expect(terminalShellByDefault("gold")).toBe(false);
    expect(terminalShellByDefault("obsidian")).toBe(false);
  });

  it("okul adı ile tenant adı farkını bildirir, boş adı fark saymaz", () => {
    expect(institutionNameMismatch("Nilüfer Acar Müzik Akademi", "Nilüfer Acar Müzik Akademisi")).toBe(true);
    expect(institutionNameMismatch("Aynı Ad", "aynı ad")).toBe(false);
    expect(institutionNameMismatch("A", "")).toBe(false);
  });

  it("logo sürümü aynı adresi değiştirir, data-URI'ye dokunmaz", () => {
    const data = "data:image/png;base64,aaaa";
    expect(withLogoVersion(data, "2")).toBe(data);
    expect(withLogoVersion("https://cdn.example.com/logo.png", "20")).toBe("https://cdn.example.com/logo.png?v=20");
    expect(withLogoVersion("https://cdn.example.com/logo.png?x=1", "20")).toBe("https://cdn.example.com/logo.png?x=1&v=20");
  });

  it("tarih ve sayı kurum dilini izler", () => {
    const stamp = Date.UTC(2026, 8, 27, 9, 0);
    expect(formatInLocale(stamp, "tr", "Europe/Istanbul")).toContain("2026");
    expect(formatInLocale(stamp, "en", "Europe/Istanbul")).toContain("2026");
    expect(formatInLocale(stamp, "tr", "Europe/Istanbul")).not.toBe(formatInLocale(stamp, "en", "Europe/Istanbul"));
    expect(formatNumberInLocale(12000.5, "tr")).not.toBe(formatNumberInLocale(12000.5, "en"));
  });

  it("sıfırlama metni dil seçer ve neviihub bağlantısı https olur", () => {
    expect(passwordResetMail("en", "North Studio").button).toBe("Reset password");
    expect(passwordResetMail("tr", "Kuzey").button).toBe("Şifremi sıfırla");
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "http://test.neviihub.com";
    expect(getPublicAppBaseUrl()).toBe("https://test.neviihub.com");
    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(getPublicAppBaseUrl()).toBe("http://localhost:3000");
    if (previous === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previous;
  });
});
