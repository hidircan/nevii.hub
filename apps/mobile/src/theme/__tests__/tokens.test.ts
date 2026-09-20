/**
 * Tema sözleşmesi regresyon testi — kök neden: eski/paralel bir `colors`/
 * `colorsDark` düz obje API'si (bkz. list-screen.tsx/logout-row.tsx/
 * placeholder-screen.tsx/screen-states.tsx, artık `useTheme()`'e taşındı)
 * `tokens.ts`'te HİÇ EXPORT edilmiyordu — `undefined.surface` erişimi
 * "Cannot read property 'surface' of undefined" ile çöküyordu. Bu test TEK
 * gerçek kaynağın (`lightTheme`/`darkTheme`) her zaman tüm renk anahtarlarını
 * TANIMLI döndürdüğünü doğrular; ekran bileşenleri artık ikinci bir tema
 * objesi İCAT ETMEDEN doğrudan bunu tüketir (bkz. theme-context.tsx useTheme).
 */
import { describe, it, expect } from "vitest";
import { lightTheme, darkTheme, type ThemeColors } from "../tokens";

const REQUIRED_COLOR_KEYS: (keyof ThemeColors)[] = [
  "primary",
  "primaryStrong",
  "primarySoft",
  "primaryOn",
  "success",
  "successSoft",
  "warning",
  "warningSoft",
  "danger",
  "dangerSoft",
  "info",
  "infoSoft",
  "bg",
  "bgMuted",
  "bgRaised",
  "border",
  "borderStrong",
  "divider",
  "text",
  "textMuted",
  "textFaint",
  "textInverse",
  "overlay",
];

describe("tek tema sözleşmesi — lightTheme/darkTheme", () => {
  it.each([
    ["lightTheme", lightTheme],
    ["darkTheme", darkTheme],
  ])("%s tüm renk anahtarlarını tanımlı (string) döndürür — undefined YOK", (_name, theme) => {
    for (const key of REQUIRED_COLOR_KEYS) {
      expect(typeof theme.colors[key]).toBe("string");
      expect(theme.colors[key].length).toBeGreaterThan(0);
    }
  });

  it("mode alanı doğru ayarlı", () => {
    expect(lightTheme.mode).toBe("light");
    expect(darkTheme.mode).toBe("dark");
  });

  it("açık/koyu tema gerçekten farklı renkler kullanır (davranış korunuyor)", () => {
    expect(lightTheme.colors.bg).not.toBe(darkTheme.colors.bg);
    expect(lightTheme.colors.text).not.toBe(darkTheme.colors.text);
    expect(lightTheme.colors.primary).not.toBe(darkTheme.colors.primary);
  });

  it("eski düz obje API'si (`colors`/`colorsDark`) artık export edilmiyor — tek sözleşme lightTheme/darkTheme", async () => {
    const mod = await import("../tokens");
    expect((mod as Record<string, unknown>).colors).toBeUndefined();
    expect((mod as Record<string, unknown>).colorsDark).toBeUndefined();
  });

  it("tipografi ölçeği — +2pt (display 32 / screen 28 / section 20 / card 18 / body 17 / caption 15 / label 13)", async () => {
    const mod = await import("../tokens");
    for (const theme of [mod.lightTheme, mod.darkTheme]) {
      expect(theme.typography.display.fontSize).toBe(32);
      expect(theme.typography.screenTitle.fontSize).toBe(28);
      expect(theme.typography.sectionTitle.fontSize).toBe(20);
      expect(theme.typography.cardTitle.fontSize).toBe(18);
      expect(theme.typography.body.fontSize).toBe(17);
      expect(theme.typography.bodyStrong.fontSize).toBe(17);
      expect(theme.typography.caption.fontSize).toBe(15);
      expect(theme.typography.label.fontSize).toBe(13);
    }
  });

  it("tema varsayılanı AÇIK — sistem koyu modda bile ilk görünüm light (statik denetim)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "theme-context.tsx"), "utf-8");
    expect(content).toMatch(/useState<ThemePreference>\("light"\)/);
    expect(content).not.toMatch(/useState<ThemePreference>\("system"\)/);
  });

  it("font sözleşmesi — display (Gloock) yalnız başlıklarda, gövde serif (Times görünümü)", async () => {
    const mod = await import("../tokens");
    expect(typeof mod.fonts.display).toBe("string");
    expect(mod.fonts.display.length).toBeGreaterThan(0);
    expect(mod.lightTheme.typography.display.fontFamily).toBe(mod.fonts.display);
    expect(mod.darkTheme.typography.display.fontFamily).toBe(mod.fonts.display);
    // Gloock tek kesit (400) — kalınlaştırma yok.
    expect(mod.lightTheme.typography.display.fontWeight).toBe("400");
    // Başlık hiyerarşisi (screen/section) sistem sans'ında kalır.
    expect((mod.lightTheme.typography.screenTitle as { fontFamily?: string }).fontFamily).toBeUndefined();
    expect((mod.lightTheme.typography.sectionTitle as { fontFamily?: string }).fontFamily).toBeUndefined();
    // Başlık dışı her şey serif: gövde + vurgulu gövde + kart içeriği + caption + label.
    expect(mod.lightTheme.typography.body.fontFamily).toBe(mod.fonts.serif);
    expect(mod.lightTheme.typography.bodyStrong.fontFamily).toBe(mod.fonts.serifBold);
    expect(mod.lightTheme.typography.cardTitle.fontFamily).toBe(mod.fonts.serifBold);
    expect(mod.lightTheme.typography.caption.fontFamily).toBe(mod.fonts.serif);
    expect(mod.lightTheme.typography.label.fontFamily).toBe(mod.fonts.serifBold);
  });

  it("platform serif eşlemesi — iOS Times New Roman, Android Tinos, web CSS yığını", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const ios = await fs.readFile(path.join(__dirname, "..", "serif-font.ios.ts"), "utf-8");
    expect(ios).toContain('"Times New Roman"');
    const android = await fs.readFile(path.join(__dirname, "..", "serif-font.android.ts"), "utf-8");
    expect(android).toContain("Tinos_400Regular");
    expect(android).toContain("Tinos_700Bold");
    const base = await fs.readFile(path.join(__dirname, "..", "serif-font.ts"), "utf-8");
    expect(base).toContain("Times New Roman, Times, serif");
    // Android yükleyici Tinos kesitlerini içerir.
    const loader = await fs.readFile(path.join(__dirname, "..", "fonts.ts"), "utf-8");
    expect(loader).toMatch(/Tinos_400Regular.*Tinos_700Bold/s);
    expect(loader).toMatch(/Platform\.OS === "android"/);
  });

  it("Inter referansı yok (doğrudan/fallback/override)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = path.join(__dirname, "..", "..");
    const hits: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const content = await fs.readFile(full, "utf-8");
          // Yorumlar elenir (dokümantasyon "Inter YOK" diyebilir), sonra kelime
          // sınırı aranır (interval/interaction gibi kelimeler elenir).
          const code = content
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|\s)\/\/.*$/gm, "$1")
            .replace(/\b(interval|interact\w*|internal|international|pointer|printer|winter|enter|interest\w*)\b/gi, "");
          if (/\bInter\b/.test(code)) {
            hits.push(path.relative(root, full));
          }
        }
      }
    }
    await walk(root);
    await walk(path.join(root, "..", "app"));
    expect(hits).toEqual([]);
  });
});
