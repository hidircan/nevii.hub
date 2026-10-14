import { describe, it, expect } from "vitest";
import { networkError, featureUnavailable, toApiResult } from "../errors";

describe("toApiResult — sunucu zarfı ve HTTP hata eşlemesi", () => {
  it("2xx + ok:true → data", () => {
    expect(toApiResult(200, { ok: true, data: { a: 1 } })).toEqual({ ok: true, data: { a: 1 } });
  });

  it.each([
    [401, "UNAUTHORIZED", "Oturumunuzun süresi doldu"],
    [403, "FORBIDDEN", "yetkiniz yok"],
    [404, "NOT_FOUND", "bulunamadı"],
    [429, "RATE_LIMITED", "Çok fazla deneme"],
    [500, "INTERNAL_ERROR", "Sunucuda bir sorun"],
  ])("HTTP %i → %s + sabit Türkçe mesaj (sunucunun İngilizce metni sızmaz)", (status, code, fragment) => {
    const res = toApiResult(status, { ok: false, error: { code, message: "Invalid or expired refresh token" } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe(code);
    expect(res.error.status).toBe(status);
    expect(res.error.message).toContain(fragment);
    expect(res.error.message).not.toContain("Invalid");
  });

  it("400/409 iş kuralı mesajı korunur (ör. kapalı gün)", () => {
    const res = toApiResult(409, { ok: false, error: { code: "CONFLICT", message: "Bu gün yoklamaya kapalı." } });
    expect(res).toEqual({ ok: false, error: { code: "CONFLICT", status: 409, message: "Bu gün yoklamaya kapalı." } });
  });

  it("JSON olmayan 404 (route yok / HTML sayfa) → NOT_FOUND, sahte başarı yok", () => {
    const res = toApiResult(404, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("JSON olmayan 502 → sunucu hatası", () => {
    const res = toApiResult(502, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("Sunucuda bir sorun");
  });

  it("2xx ama zarf yok → UNEXPECTED_RESPONSE (sessiz boş ekran değil)", () => {
    const res = toApiResult(200, { lessons: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNEXPECTED_RESPONSE");
  });

  it("2xx gövdede ok:false → koddan sınıf çıkarılır", () => {
    const res = toApiResult(200, { ok: false, error: { code: "FORBIDDEN", message: "x" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.status).toBe(403);
  });

  it("ağ hatası mesajı Türkçe ve yönlendirici", () => {
    expect(networkError("tr").code).toBe("NETWORK_ERROR");
    expect(networkError("tr").message).toContain("İnternet bağlantınızı");
  });

  it("hata mesajları İngilizce de üretilir (varsayılan dil etkilenmez)", () => {
    expect(networkError("en").message).toContain("internet connection");
    expect(featureUnavailable("en").message).toContain("mobile app");
    expect(featureUnavailable("tr").message).toContain("mobil uygulamada");
    const res = toApiResult(401, { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid" } }, "en");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain("expired");
  });
});
