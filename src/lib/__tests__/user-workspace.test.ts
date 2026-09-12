import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  USER_PREFERENCES_FILE,
  getUserPreferences,
  isSafeLastRoute,
  resolveResumeRoute,
  saveUserPreferences,
} from "../user-preferences";
import { clampPreferencesToPolicy, resolveAppearancePolicy } from "../appearance-policy";
import { mergeNavOrder } from "../nav/order";
import { DEFAULT_TENANT_ID } from "../auth/config";

/**
 * P1 (2026-09-11) — kullanıcı workspace ayrımı (Ezgi/Nihal senaryosu):
 * tercihler hesap bazlıdır (userId + tenantId); policy tercihi aşamaz;
 * son rota güvenlidir.
 */
beforeEach(async () => {
  await fs.rm(USER_PREFERENCES_FILE, { force: true });
});

describe("hesap bazlı tercih ayrımı", () => {
  it("Ezgi'nin düzeni Nihal'e sızmaz; her hesap kendi kaydını okur", async () => {
    await saveUserPreferences("user_ezgi", DEFAULT_TENANT_ID, {
      themeProfile: "obsidian",
      sidebarCollapsed: true,
      navOrder: { main: ["/panel/yoklama", "/panel/program"] },
      lastRoute: "/panel/yoklama",
    });
    await saveUserPreferences("user_nihal", DEFAULT_TENANT_ID, {
      themeProfile: "gold",
      sidebarCollapsed: false,
      lastRoute: "/panel/program",
    });

    const ezgi = await getUserPreferences("user_ezgi", DEFAULT_TENANT_ID);
    const nihal = await getUserPreferences("user_nihal", DEFAULT_TENANT_ID);
    expect(ezgi.themeProfile).toBe("obsidian");
    expect(ezgi.sidebarCollapsed).toBe(true);
    expect(ezgi.navOrder).toEqual({ main: ["/panel/yoklama", "/panel/program"] });
    expect(ezgi.lastRoute).toBe("/panel/yoklama");
    expect(nihal.themeProfile).toBe("gold");
    expect(nihal.sidebarCollapsed).toBe(false);
    expect(nihal.navOrder).toBeUndefined();
    expect(nihal.lastRoute).toBe("/panel/program");
  });

  it("aynı kullanıcının farklı tenant kayıtları ayrılır", async () => {
    await saveUserPreferences("user_x", "tenant_a", { lastRoute: "/panel/a" });
    await saveUserPreferences("user_x", "tenant_b", { lastRoute: "/panel/b" });
    expect((await getUserPreferences("user_x", "tenant_a")).lastRoute).toBe("/panel/a");
    expect((await getUserPreferences("user_x", "tenant_b")).lastRoute).toBe("/panel/b");
  });

  it("kayıt yoksa boş tercih (varsayılanlar uygulanır, hata yok)", async () => {
    const prefs = await getUserPreferences("nobody", DEFAULT_TENANT_ID);
    expect(prefs.themeProfile).toBeUndefined();
    expect(prefs.lastRoute).toBeUndefined();
  });

  it("yama birleştirir — yazılmayan alan korunur", async () => {
    await saveUserPreferences("user_x", DEFAULT_TENANT_ID, { themeProfile: "navy" });
    await saveUserPreferences("user_x", DEFAULT_TENANT_ID, { density: "compact" });
    const prefs = await getUserPreferences("user_x", DEFAULT_TENANT_ID);
    expect(prefs.themeProfile).toBe("navy");
    expect(prefs.density).toBe("compact");
  });
});

describe("appearance policy", () => {
  it("gövde fontu Gloock ENGELLENİR (Inter'e düşer); display kapsamı ayrıdır", () => {
    const clamped = clampPreferencesToPolicy({ fontChoice: "gloock" });
    expect(clamped.fontChoice).toBe("inter");
    expect(resolveAppearancePolicy().allowedBodyFonts).not.toContain("gloock");
  });

  it("normal seçimler policy'den aynen geçer", () => {
    const clamped = clampPreferencesToPolicy({ themeProfile: "navy", fontChoice: "noto_sans", density: "compact" });
    expect(clamped).toMatchObject({ themeProfile: "navy", fontChoice: "noto_sans", density: "compact" });
  });

  it("bilinmeyen değerler güvenli varsayılana düşer (hata yok)", () => {
    const clamped = clampPreferencesToPolicy({
      themeProfile: "ufo" as never,
      fontChoice: "comic" as never,
      density: "x" as never,
    });
    expect(clamped).toMatchObject({ themeProfile: "gold", fontChoice: "inter", density: "comfortable" });
  });
});

describe("son rota güvenliği", () => {
  it("güvenli panel/portal rotaları kabul edilir", () => {
    expect(isSafeLastRoute("/panel/yoklama")).toBe(true);
    expect(isSafeLastRoute("/ogretmen/program")).toBe(true);
    expect(isSafeLastRoute("/panel")).toBe(true);
  });

  it("auth/print/api rotaları reddedilir", () => {
    expect(isSafeLastRoute("/login")).toBe(false);
    expect(isSafeLastRoute("/sifre-sifirla")).toBe(false);
    expect(isSafeLastRoute("/api/v1/auth/login")).toBe(false);
    expect(isSafeLastRoute("/sozlesme-yazdir/abc")).toBe(false);
    expect(isSafeLastRoute("/evrak-yazdir/abc")).toBe(false);
    expect(isSafeLastRoute("//evil.com")).toBe(false);
    expect(isSafeLastRoute("")).toBe(false);
  });

  it("rolü değişen/rolüne uymayan rota güvenli panele düşer", () => {
    expect(resolveResumeRoute("SCHOOL_ADMIN", "/panel/yoklama", "/panel")).toBe("/panel/yoklama");
    expect(resolveResumeRoute("TEACHER", "/panel/yoklama", "/ogretmen")).toBe("/ogretmen");
    expect(resolveResumeRoute("TEACHER", "/ogretmen/program", "/ogretmen")).toBe("/ogretmen/program");
    expect(resolveResumeRoute("STUDENT", "/ogretmen/program", "/ogrenci")).toBe("/ogrenci");
    expect(resolveResumeRoute("SCHOOL_ADMIN", "/login", "/panel")).toBe("/panel");
    expect(resolveResumeRoute("SCHOOL_ADMIN", undefined, "/panel")).toBe("/panel");
  });
});

describe("menü sıra birleştirme", () => {
  const live = ["/panel/a", "/panel/b", "/panel/c"];

  it("kayıtlı sıra korunur; yeni öğe sona eklenir", () => {
    expect(mergeNavOrder(["/panel/c", "/panel/a"], live)).toEqual(["/panel/c", "/panel/a", "/panel/b"]);
  });

  it("ölü href düşer; kayıt yoksa canlı sıra", () => {
    expect(mergeNavOrder(["/panel/zzz", "/panel/b"], live)).toEqual(["/panel/b", "/panel/a", "/panel/c"]);
    expect(mergeNavOrder(undefined, live)).toEqual(live);
  });
});
