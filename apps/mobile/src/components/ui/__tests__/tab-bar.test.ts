/**
 * Alt sekme çubuğu tek kaynak sözleşmesi (İş 1, 2026-10-30).
 *
 * KÖK NEDEN: SDK 57 expo-router altındaki BottomTabBar önce kendi iç
 * stilinde `paddingBottom: insets.bottom` uygular, SONRA verilen
 * `tabBarStyle`'ı iç stilin ÜSTÜNE merge eder. Dört portal layout'un
 * sabit `paddingBottom: 6` verisi inset'i EZİYORDU: 3 düğmeli Android
 * sistem navigasyonunda içerik bölümü çubuk alanına sarkıyor, yazılar
 * sistem düğmeleriyle kesişiyordu.
 *
 * ÇÖZÜM: `height = 64 + insets.bottom`, `paddingBottom = insets.bottom`
 * TEK yerden (tab-bar.tsx). Aşağıdaki testler inset senaryolarını ve
 * layout'ların yapısını paylaşılan kaynağa bağlanmaya kilitler.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_ICON_SIZE,
  portalTabBarStyle,
} from "../tab-bar-style";

const APP_DIR = path.join(__dirname, "..", "..", "..", "..", "app");

const COLORS = { bg: "#112233", border: "#445566" };

describe("portalTabBarStyle — safe-area inset tek noktada", () => {
  it("3 düğmeli Android (~48pt): çubuk içerik şeridi sistem alanının ÜSTÜNDE", () => {
    const s = portalTabBarStyle(COLORS, 48);
    expect(s.height).toBe(TAB_BAR_CONTENT_HEIGHT + 48);
    expect(s.paddingBottom).toBe(48);
  });

  it("hareketli gezinme Android (~24pt) ve iOS home bar (34pt)", () => {
    const gesture = portalTabBarStyle(COLORS, 24);
    expect(gesture.height).toBe(TAB_BAR_CONTENT_HEIGHT + 24);
    expect(gesture.paddingBottom).toBe(24);

    const ios = portalTabBarStyle(COLORS, 34);
    expect(ios.height).toBe(TAB_BAR_CONTENT_HEIGHT + 34);
    expect(ios.paddingBottom).toBe(34);
  });

  it("insetsiz yüzeyde 0 → klasik 64pt şerit", () => {
    const s = portalTabBarStyle(COLORS, 0);
    expect(s.height).toBe(64);
    expect(s.paddingBottom).toBe(0);
  });

  it("eksik/negatif inset güvenli biçimde 0'a iner", () => {
    expect(portalTabBarStyle(COLORS, undefined as unknown as number).paddingBottom).toBe(0);
    expect(portalTabBarStyle(COLORS, -20).paddingBottom).toBe(0);
    expect(portalTabBarStyle(COLORS, NaN as unknown as number).height).toBe(64);
  });

  it("renkler taşınır ve `extra` EN SONA merge edilir (kütüphane merge sırasıyla uyumlu)", () => {
    const s = portalTabBarStyle(COLORS, 12, { borderTopWidth: 1, height: 999 });
    expect(s.backgroundColor).toBe(COLORS.bg);
    expect(s.borderTopColor).toBe(COLORS.border);
    expect(s.borderTopWidth).toBe(1);
    expect(s.height).toBe(999); // çağıranın açık isteği kazanır
  });
});

describe("paylaşılan sabitler", () => {
  it("etkileşim şeridi 64pt, ikon boyutu 22pt korunur (dokunma alanı küçülmez)", () => {
    expect(TAB_BAR_CONTENT_HEIGHT).toBe(64);
    expect(TAB_ICON_SIZE).toBe(22);
  });
});

describe("dört portal layout'u TEK kaynağı okur", () => {
  const layouts = [
    "(admin)/_layout.tsx",
    "(student)/_layout.tsx",
    "(parent)/_layout.tsx",
    "(teacher)/_layout.tsx",
  ];

  it.each(layouts)("%s: paylaşılan hook + ikon boyutu kullanır, sabit padding YOK", async (rel) => {
    const src = await fs.readFile(path.join(APP_DIR, rel), "utf-8");
    expect(src, `${rel} paylaşılan hook'u kullanmalı`).toMatch(/usePortalTabBarStyle\(/);
    expect(src, `${rel} paylaşılan ikon boyutunu kullanmalı`).toMatch(/TAB_ICON_SIZE/);
    expect(src, `${rel} etiket bileşeni TabBarLabel olmalı`).toMatch(/TabBarLabel/);
    // Cihaz bağımlı sabit yama yasak: ÇUBUK bandının stili inline objede
    // verilmez (tabBarItemStyle'daki pill padding'i meşrudur — dokunulmaz).
    expect(src, `${rel} manuel paddingBottom YOK`).not.toMatch(/tabBarStyle:\s*\{/);
    // tabBarStyle doğrudan obje literal'i İLE DEĞİL, hook ile verilir.
    expect(src).toMatch(/tabBarStyle,/);
  });

  it("ui barrel paylaşılan alt çubuk API'sini dışa aktarır", async () => {
    const barrel = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "..", "src", "components", "ui", "index.ts"),
      "utf-8"
    );
    expect(barrel).toMatch(/from "\.\/tab-bar"/);
    expect(barrel).toMatch(/from "\.\/tab-bar-label"/);
  });
});
