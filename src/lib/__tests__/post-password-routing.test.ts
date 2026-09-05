import { describe, it, expect } from "vitest";
import {
  detectClientSurface,
  detectMobilePlatform,
  isSafeInternalPath,
  portalPathForRole,
  resolvePostPasswordDestination,
} from "../auth/post-password-routing";

/**
 * P0 (2026-09-05) — davet/şifre oluşturma sonrası yönlendirme kuralları.
 * Rol GÜVENİLİR sunucu verisinden gelir; user-agent yalnız sunum/derin
 * bağlantı seçimini etkiler.
 */
const APP = { scheme: "neviihub", appStoreUrl: "https://apps.apple.com/x", playStoreUrl: "https://play.google.com/x" };

describe("portalPathForRole", () => {
  it("öğrenci ve öğretmen kendi portalına, personel panele gider", () => {
    expect(portalPathForRole("STUDENT")).toBe("/ogrenci");
    expect(portalPathForRole("TEACHER")).toBe("/ogretmen");
    expect(portalPathForRole("SCHOOL_ADMIN")).toBe("/panel");
  });
});

describe("resolvePostPasswordDestination", () => {
  it("masaüstü web: doğrudan rol portalı, derin bağlantı YOK", () => {
    for (const role of ["STUDENT", "TEACHER"] as const) {
      const d = resolvePostPasswordDestination({ role, surface: "desktop_web", app: APP });
      expect(d.webPath).toBe(portalPathForRole(role));
      expect(d.deepLink).toBeUndefined();
    }
  });

  it("uygulama içi: aynı portal yolu, derin bağlantı denenmez (döngü riski yok)", () => {
    const d = resolvePostPasswordDestination({ role: "STUDENT", surface: "mobile_app", app: APP });
    expect(d).toEqual({ webPath: "/ogrenci" });
  });

  it("mobil web + uygulama tanımlı: role özel derin bağlantı ve mağaza bağlantısı döner", () => {
    const student = resolvePostPasswordDestination({
      role: "STUDENT",
      surface: "mobile_web",
      app: APP,
      platform: "ios",
    });
    expect(student.deepLink).toBe("neviihub://ogrenci");
    expect(student.appDownloadUrl).toBe(APP.appStoreUrl);
    expect(student.webPath).toBe("/ogrenci");

    const teacher = resolvePostPasswordDestination({
      role: "TEACHER",
      surface: "mobile_web",
      app: APP,
      platform: "android",
    });
    expect(teacher.deepLink).toBe("neviihub://ogretmen");
    expect(teacher.appDownloadUrl).toBe(APP.playStoreUrl);
    expect(teacher.webPath).toBe("/ogretmen");
  });

  it("mobil web + uygulama YOK: SAHTE derin bağlantı/mağaza bağlantısı üretilmez, güvenli web düşüşü kalır", () => {
    const d = resolvePostPasswordDestination({ role: "STUDENT", surface: "mobile_web", app: {}, platform: "ios" });
    expect(d).toEqual({ webPath: "/ogrenci" });
  });

  it("personel rolleri için mobil derin bağlantı üretilmez (uygulama portalı yok)", () => {
    const d = resolvePostPasswordDestination({ role: "SCHOOL_ADMIN", surface: "mobile_web", app: APP });
    expect(d).toEqual({ webPath: "/panel" });
  });
});

describe("isSafeInternalPath — açık yönlendirme koruması", () => {
  it("yalnız tek eğik çizgiyle başlayan göreli yolları kabul eder", () => {
    expect(isSafeInternalPath("/ogrenci")).toBe(true);
    expect(isSafeInternalPath("/panel/ogrenciler?x=1")).toBe(true);
  });

  it("protokol/host kaçışlarını reddeder", () => {
    for (const bad of ["//evil.com", "https://evil.com", "http://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(isSafeInternalPath(bad)).toBe(false);
    }
  });
});

describe("istemci ortamı tespiti (yalnız sunum)", () => {
  it("mobil ve masaüstü user-agent'ları ayırır", () => {
    expect(detectClientSurface("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile_web");
    expect(detectClientSurface("Mozilla/5.0 (Linux; Android 14)")).toBe("mobile_web");
    expect(detectClientSurface("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop_web");
  });

  it("uygulama bayrağı her şeyin önündedir", () => {
    expect(detectClientSurface("Mozilla/5.0 (Macintosh)", true)).toBe("mobile_app");
  });

  it("mağaza seçimi için platform tespiti", () => {
    expect(detectMobilePlatform("iPhone")).toBe("ios");
    expect(detectMobilePlatform("Android 14")).toBe("android");
    expect(detectMobilePlatform("Macintosh")).toBe("unknown");
  });
});
