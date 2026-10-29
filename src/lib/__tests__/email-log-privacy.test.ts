/**
 * Gizlilik (2026-10-03): console e-posta taşıyıcısı alıcının yerel kısmını, konuyu ve gövdeyi loglamaz
 * (gövde bağlantı/jeton içerebilir). Yerel geliştirmede EMAIL_PROVIDER=console ile kullanılır.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailTransport, maskEmailForLog } from "../email/transport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("e-posta logu kişisel veri içermez", () => {
  it("alıcı adresi maskelenir", () => {
    expect(maskEmailForLog("ada.yilmaz@ornek-kurum.com")).toBe("***@ornek-kurum.com");
    expect(maskEmailForLog("gecersiz")).toBe("***");
  });

  it("console taşıyıcısı adres, konu ve gövdeyi loga yazmaz", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "console");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await getEmailTransport().send({ to: "ada.yilmaz@ornek-kurum.com", subject: "Şifre sıfırlama", html: "<a href='https://x/sifre-sifirla?token=GIZLI123'>link</a>", text: "token=GIZLI123" });
    expect(res.delivered).toBe(false);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain("ada.yilmaz");
    expect(logged).not.toContain("GIZLI123");
    expect(logged).not.toContain("Şifre sıfırlama");
    expect(logged).toContain("***@ornek-kurum.com");
  });
});
