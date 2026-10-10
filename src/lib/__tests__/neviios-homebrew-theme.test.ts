import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  THEME_PROFILE_VALUES,
  THEME_PROFILE_LABELS,
  THEME_PROFILE_DESCRIPTIONS,
  DEFAULT_THEME_PROFILE,
  normalizeThemeProfile,
} from "../theme";
import { DARK_THEME_PROFILES as PLATFORM_DARK } from "../platform/policies";
import { DARK_THEME_PROFILES as POLICY_DARK, clampPreferencesToPolicy } from "../appearance-policy";
import { applyAppearancePolicy, DEFAULT_APPEARANCE_POLICY } from "../platform/policies";
import { resolvePlatformShell } from "../platform/shell-theme";

/**
 * NeviiOS Control Center (2026-09-28) — "Homebrew Hacker" tema + Gloock
 * menü markası hedefli regresyon: varsayılan seçimi, tercih korunması,
 * koyu-profil politikası, font kaynağı/fallback.
 */

const ROOT = process.cwd();

describe("homebrew profili kayıtlı", () => {
  it("normalize eder, etiketi/açıklaması vardır", () => {
    expect(normalizeThemeProfile("homebrew")).toBe("homebrew");
    expect(THEME_PROFILE_VALUES).toContain("homebrew");
    expect(THEME_PROFILE_LABELS.homebrew).toBe("Homebrew Hacker");
    expect(THEME_PROFILE_DESCRIPTIONS.homebrew.length).toBeGreaterThan(0);
  });

  it("kurum paneli varsayılanı değişmez (gold)", () => {
    expect(DEFAULT_THEME_PROFILE).toBe("gold");
  });

  it("iki koyu-profil listesinde de homebrew vardır (tek kaynak kuralı)", () => {
    expect(PLATFORM_DARK).toContain("homebrew");
    expect(POLICY_DARK).toContain("homebrew");
  });

  it("light_only politikası homebrew'u güvenli varsayılana indirger", () => {
    const out = applyAppearancePolicy({ ...DEFAULT_APPEARANCE_POLICY, mode: "light_only" }, { profile: "homebrew", font: "inter" });
    expect(out.profile).toBe("gold");
    const clamped = clampPreferencesToPolicy({ themeProfile: "homebrew" }, { allowDarkProfiles: false, allowedBodyFonts: ["inter"] });
    expect(clamped.themeProfile).toBe("gold");
  });

  it("serbest politikada homebrew seçilebilir", () => {
    const out = applyAppearancePolicy(DEFAULT_APPEARANCE_POLICY, { profile: "homebrew", font: "inter" });
    expect(out.profile).toBe("homebrew");
  });
});

describe("platform kabuğu varsayılanı — kayıtlı tercih ezilmez", () => {
  it("tercihsiz HYPER_ADMIN → homebrew", () => {
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: null, cookieTheme: null })).toBe("homebrew");
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: undefined, cookieTheme: undefined })).toBe("homebrew");
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: "", cookieTheme: "" })).toBe("homebrew");
  });

  it("kayıtlı store tercihi veya cookie varsa saygı duyulur (ezme yok)", () => {
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: "gold", cookieTheme: null })).toBe("plain");
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: "obsidian", cookieTheme: "obsidian" })).toBe("plain");
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: null, cookieTheme: "gold" })).toBe("console");
    expect(resolvePlatformShell({ role: "HYPER_ADMIN", savedThemeProfile: "homebrew", cookieTheme: "homebrew" })).toBe("plain");
  });

  it("HYPER_ADMIN değilse homebrew varsayılanı uygulanmaz", () => {
    expect(resolvePlatformShell({ role: "SUPER_ADMIN", savedThemeProfile: null, cookieTheme: null })).toBe("console");
  });
});

describe("Gloock menü markası — kaynak, fallback, dar kapsam", () => {
  const nav = readFileSync(path.join(ROOT, "src/components/platform/platform-nav.tsx"), "utf8");
  const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const layout = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");

  it("menüdeki NeviiHub yazısı .brand-mark sınıfıyla Gloock kullanır", () => {
    expect(nav).toMatch(/className="brand-mark[^"]*"/);
  });

  it(".brand-mark Georgia/Times fallback'e düşer (font yüklenemezse okunur kalır)", () => {
    expect(css).toMatch(/\.brand-mark \{\s*font-family: var\(--font-gloock\), Gloock, Georgia/);
  });

  it("Gloock next/font ile build-time self-host edilir (çalışma zamanı Google isteği yok)", () => {
    expect(layout).toMatch(/Gloock\(\{[^}]*variable:\s*"--font-gloock"/);
    expect(layout).toMatch(/gloock\.variable/);
  });

  it("font tüm uygulamaya körlemesine yayılmaz (body hâlâ --font-sans)", () => {
    expect(css).toContain("font-family: var(--font-sans)");
  });
});
