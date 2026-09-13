import { describe, expect, it } from "vitest";
import { containsSensitiveText, isAccessScopeError, portalErrorMessage } from "../api-error-message";

describe("portalErrorMessage (öğrenci/veli kullanıcı dostu hata dili)", () => {
  it("ağ hatasında bağlantı metni gösterir, teknik detay vermez", () => {
    expect(portalErrorMessage("NETWORK_ERROR")).toBe("İnternet bağlantısı kurulamadı. Lütfen tekrar deneyin.");
  });

  it("401 sonrası login yönlendirmesine uygun metin gösterir", () => {
    expect(portalErrorMessage("UNAUTHORIZED")).toBe("Oturumunuz sona erdi. Tekrar giriş yapın.");
  });

  it("403 sonrası yetkisiz state metni gösterir", () => {
    expect(portalErrorMessage("FORBIDDEN")).toBe("Bu bilgiye erişim yetkiniz yok.");
  });

  it("404 sonrası kayıt-bulunamadı metni gösterir", () => {
    expect(portalErrorMessage("NOT_FOUND")).toBe("İstenen kayıt bulunamadı.");
  });

  it("429 sonrası bekle-tekrar-dene metni gösterir", () => {
    expect(portalErrorMessage("RATE_LIMITED")).toBe("Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.");
  });

  it("5xx/beklenmeyen yanıtta genel yüklenemedi metni gösterir", () => {
    expect(portalErrorMessage("INTERNAL_ERROR")).toBe("Şu anda veriler yüklenemedi. Tekrar deneyin.");
    expect(portalErrorMessage("UNEXPECTED_RESPONSE")).toBe("Şu anda veriler yüklenemedi. Tekrar deneyin.");
  });

  it("girdi hatalarında backend'in eyleme dönük mesajını korur", () => {
    expect(portalErrorMessage("VALIDATION_ERROR", "Tarih gelecekte olmalı")).toBe("Tarih gelecekte olmalı");
    expect(portalErrorMessage("CONFLICT", "Bu dönem için hakkınız doldu")).toBe("Bu dönem için hakkınız doldu");
  });

  it("bilinmeyen kodda ham backend mesajını ASLA göstermez", () => {
    expect(portalErrorMessage("SOME_FUTURE_CODE")).toBe("Şu anda veriler yüklenemedi. Tekrar deneyin.");
    expect(portalErrorMessage("SOME_FUTURE_CODE", "Özel backend mesajı")).toBe(
      "Şu anda veriler yüklenemedi. Tekrar deneyin."
    );
  });

  it("bilinmeyen koda hassas içerik sızdırmaz", () => {
    const nasty =
      "Error: P1001 Can't reach database server at DATABASE_URL=postgres://x at QueryEngine.execute (/app/node_modules/.pnpm/prisma:123:45) token=abc password=hunter2";
    const out = portalErrorMessage("WEIRD_CODE", nasty);
    expect(out).toBe("Şu anda veriler yüklenemedi. Tekrar deneyin.");
    expect(out).not.toContain("DATABASE_URL");
    expect(out).not.toContain("token");
    expect(out).not.toContain("password");
    expect(out).not.toContain("prisma");
  });

  it("girdi hatasında bile hassas fallback genel metne düşer", () => {
    expect(portalErrorMessage("VALIDATION_ERROR", "invalid token: abc123")).toBe(
      "Şu anda veriler yüklenemedi. Tekrar deneyin."
    );
    expect(portalErrorMessage("CONFLICT", "exception at Foo.bar (/srv/x.ts:1:2)")).toBe(
      "Şu anda veriler yüklenemedi. Tekrar deneyin."
    );
  });

  it("boş fallback'i yutmaz, genel metne düşer", () => {
    expect(portalErrorMessage("VALIDATION_ERROR", "   ")).toBe("Şu anda veriler yüklenemedi. Tekrar deneyin.");
  });

  it("hiçbir çıktıda stack/secret kalıbı yer almaz", () => {
    const codes = ["NETWORK_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "INTERNAL_ERROR"];
    for (const code of codes) {
      expect(containsSensitiveText(portalErrorMessage(code))).toBe(false);
    }
  });
});

describe("containsSensitiveText", () => {
  it("secret/token/password/database kalıplarını yakalar", () => {
    expect(containsSensitiveText("your API_KEY leaked")).toBe(true);
    expect(containsSensitiveText("DATABASE_URL missing")).toBe(true);
    expect(containsSensitiveText("DIRECT_URL invalid")).toBe(true);
    expect(containsSensitiveText("reset your password")).toBe(true);
    expect(containsSensitiveText("refresh token expired")).toBe(true);
    expect(containsSensitiveText("prisma query failed")).toBe(true);
    expect(containsSensitiveText("supabase error")).toBe(true);
    expect(containsSensitiveText("at Object.handler (/app/api/route.ts:10:5)")).toBe(true);
  });

  it("sıradan kullanıcı mesajlarını temiz sayar", () => {
    expect(containsSensitiveText("Tarih gelecekte olmalı")).toBe(false);
    expect(containsSensitiveText("Şu anda veriler yüklenemedi. Tekrar deneyin.")).toBe(false);
  });
});

describe("isAccessScopeError", () => {
  it("FORBIDDEN ve NOT_FOUND erişim-kapsamı gerçeğidir (retry'siz)", () => {
    expect(isAccessScopeError("FORBIDDEN")).toBe(true);
    expect(isAccessScopeError("NOT_FOUND")).toBe(true);
  });

  it("geçici hatalar erişim-kapsamı değildir (retry gösterilir)", () => {
    expect(isAccessScopeError("NETWORK_ERROR")).toBe(false);
    expect(isAccessScopeError("UNEXPECTED_RESPONSE")).toBe(false);
    expect(isAccessScopeError("INTERNAL_ERROR")).toBe(false);
    expect(isAccessScopeError("UNAUTHORIZED")).toBe(false);
    expect(isAccessScopeError("RATE_LIMITED")).toBe(false);
    expect(isAccessScopeError("VALIDATION_ERROR")).toBe(false);
    expect(isAccessScopeError("CONFLICT")).toBe(false);
  });
});
