/**
 * Owner kararı (2026-10-29) — kurum menü/yetki ayrımı:
 * - Aboneliğim / Fatura Bilgilerim / Faturalarım / Kurum Ayarları: yan
 *   menüde YOK, yalnız kurum sahibi (SUPER_ADMIN) görür, girişi
 *   `/panel/hesabim` ("Profilim / Hesap ayarları") ekranındadır.
 * - Kurum Özellikleri: menüde YOK, hiçbir kurum kullanıcısında görünmez
 *   (`/panel/ayarlar/ozellikler` → `/panel` yönlenir); HYPER_ADMIN NeviiOS'tan yürütür.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { hasPermission } from "@/lib/auth/rbac";
import { PANEL_MAIN_NAV, PANEL_FINANCE_NAV, PANEL_OPS_NAV, PANEL_AI_NAV, PANEL_SYSTEM_NAV } from "@/lib/nav/panel-nav";

const ROOT = process.cwd();
const ALL_NAV = [...PANEL_MAIN_NAV, ...PANEL_FINANCE_NAV, ...PANEL_OPS_NAV, ...PANEL_AI_NAV, ...PANEL_SYSTEM_NAV];
const hrefs = ALL_NAV.map((i) => i.href);

describe("kurum menü/yetki ayrımı", () => {
  it("abonelik + kurum ayarları yan menüde yok", () => {
    for (const h of ["/abonelik", "/abonelik/fatura-bilgilerim", "/abonelik/faturalar", "/panel/ayarlar/kurum"]) {
      expect(hrefs).not.toContain(h);
    }
  });

  it("kurum özellikleri yan menüde yok", () => {
    expect(hrefs).not.toContain("/panel/ayarlar/ozellikler");
  });

  it("hesabım ekranı 4 bağlantıyı yalnız SUPER_ADMIN'e gösterir", () => {
    const src = readFileSync(path.join(ROOT, "src/app/panel/hesabim/page.tsx"), "utf8");
    expect(src).toContain('session.role === "SUPER_ADMIN"');
    for (const h of ["/abonelik", "/abonelik/fatura-bilgilerim", "/abonelik/faturalar", "/panel/ayarlar/kurum"]) {
      expect(src).toContain(`href="${h}"`);
    }
  });

  it("4 sayfanın sunucu kapısı SUPER_ADMIN", () => {
    for (const f of [
      "src/app/abonelik/page.tsx",
      "src/app/abonelik/fatura-bilgilerim/page.tsx",
      "src/app/abonelik/faturalar/page.tsx",
      "src/app/abonelik/faturalar/[id]/page.tsx",
      "src/app/panel/ayarlar/kurum/page.tsx",
    ]) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).toContain('session.role !== "SUPER_ADMIN"');
      expect(src, f).not.toMatch(/role !== "SUPER_ADMIN" && session\.role !== "SCHOOL_ADMIN"/);
    }
  });

  it("kurum özellikleri rotası panele yönlenir (içerik yok)", () => {
    const src = readFileSync(path.join(ROOT, "src/app/panel/ayarlar/ozellikler/page.tsx"), "utf8");
    expect(src).toContain('redirect("/panel")');
    expect(src).not.toContain("FeatureToggles");
  });

  it("RBAC: kurum ayarları yetkisi yalnız sahipte; fatura yazımı yalnız sahipte", () => {
    expect(hasPermission("SUPER_ADMIN", "institution:settings")).toBe(true);
    expect(hasPermission("SCHOOL_ADMIN", "institution:settings")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "billing:write")).toBe(true);
    expect(hasPermission("SCHOOL_ADMIN", "billing:write")).toBe(false);
  });
});
