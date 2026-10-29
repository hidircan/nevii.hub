/**
 * Tema sözleşmesi regresyon testi — kök neden: eski/paralel bir `colors`/
 * `colorsDark` düz obje API'si (bkz. list-screen.tsx/logout-row.tsx/
 * placeholder-screen.tsx/screen-states.tsx, artık `useTheme()`'e taşındı)
 * `tokens.ts`'te HİÇ EXPORT edilmiyordu — `undefined.surface` erişimi
 * "Cannot read property 'surface' of undefined" ile çöküyordu. Bu test TEK
 * gerçek kaynağın (`lightTheme`/`darkTheme`) her zaman tüm renk anahtarlarını
 * TANIMLI döndürdüğünü doğrular; ekran bileşenleri artık ikinci bir tema
 * objesi İCAT ETMEDEN doğrudan bunu tüketir (bkz. theme-context.tsx useTheme).
 *
 * Tipografi sözleşmesi (2026-10): Inter 400/500/600/700 tüm ölçekte;
 * Gloock YALNIZ marka kelimesinde. Serif gövde ailesi kaldırıldı.
 */
import { describe, it, expect } from "vitest";
import { buildTheme, lightTheme, darkTheme, type ThemeColors } from "../tokens";

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

  it("tipografi ölçeği — display 32 / title 26 / headline 20 / body 16 / caption 14", () => {
    for (const theme of [lightTheme, darkTheme]) {
      expect(theme.typography.display.fontSize).toBe(32);
      expect(theme.typography.title.fontSize).toBe(26);
      expect(theme.typography.screenTitle.fontSize).toBe(26);
      expect(theme.typography.headline.fontSize).toBe(20);
      expect(theme.typography.sectionTitle.fontSize).toBe(20);
      expect(theme.typography.cardTitle.fontSize).toBe(17);
      expect(theme.typography.body.fontSize).toBe(16);
      expect(theme.typography.bodyStrong.fontSize).toBe(16);
      expect(theme.typography.caption.fontSize).toBe(14);
      expect(theme.typography.label.fontSize).toBe(12);
    }
  });

  it("yazı boyutu tercihi ölçeğin TAMAMINI orantılı büyütür (1 / 1.15 / 1.3)", () => {
    const large = buildTheme("light", 1.15);
    const xlarge = buildTheme("dark", 1.3);
    expect(lightTheme.typography.body.fontSize).toBe(16);
    expect(large.typography.body.fontSize).toBeCloseTo(18.4, 1);
    expect(xlarge.typography.body.fontSize).toBeCloseTo(20.8, 1);
    expect(large.fontScale).toBe(1.15);
    // Ölçek katsayısı tüm token'lara uygulanır (paralel sabit boyut kalmaz).
    expect(large.typography.display.fontSize).toBeCloseTo(36.8, 1);
    expect(large.typography.caption.fontSize).toBeCloseTo(16.1, 1);
  });

  it("tema varsayılanı AÇIK — sistem koyu modda bile ilk görünüm light (statik denetim)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "theme-context.tsx"), "utf-8");
    expect(content).toMatch(/useState<ThemePreference>\("light"\)/);
    expect(content).not.toMatch(/useState<ThemePreference>\("system"\)/);
  });

  it("font sözleşmesi — Inter tüm ölçekte, Gloock YALNIZ marka kelimesinde", async () => {
    const mod = await import("../tokens");
    expect(mod.fonts.display).toMatch(/Gloock/);
    expect(mod.fonts.regular).toMatch(/^Inter_400/);
    expect(mod.fonts.medium).toMatch(/^Inter_500/);
    expect(mod.fonts.semibold).toMatch(/^Inter_600/);
    expect(mod.fonts.bold).toMatch(/^Inter_700/);

    // Marka kelimesi dışında hiçbir token Gloock kullanmaz.
    for (const theme of [mod.lightTheme, mod.darkTheme]) {
      for (const [key, token] of Object.entries(theme.typography)) {
        if (key === "brand") continue;
        expect(token.fontFamily, key).not.toBe(mod.fonts.display);
      }
      expect(theme.typography.brand.fontFamily).toBe(mod.fonts.display);
    }

    // Ağırlıklar dosyayla eşleşir (regular üzerine kalınlık override'ı yok).
    expect(mod.lightTheme.typography.body.fontFamily).toBe(mod.fonts.regular);
    expect(mod.lightTheme.typography.bodyStrong.fontFamily).toBe(mod.fonts.semibold);
    expect(mod.lightTheme.typography.cardTitle.fontFamily).toBe(mod.fonts.semibold);
    expect(mod.lightTheme.typography.caption.fontFamily).toBe(mod.fonts.medium);
    expect(mod.lightTheme.typography.label.fontFamily).toBe(mod.fonts.bold);
    expect(mod.lightTheme.typography.display.fontFamily).toBe(mod.fonts.bold);
  });

  it("font yükleyici Inter 400/500/600/700 + Gloock içerir; serif paketi kaldırıldı", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const loader = await fs.readFile(path.join(__dirname, "..", "fonts.ts"), "utf-8");
    for (const name of ["Inter_400Regular", "Inter_500Medium", "Inter_600SemiBold", "Inter_700Bold", "Gloock_400Regular"]) {
      expect(loader, name).toContain(name);
    }
    expect(loader).not.toContain("NotoSerif");
    const pkg = await fs.readFile(path.join(__dirname, "..", "..", "..", "package.json"), "utf-8");
    expect(pkg).toContain("@expo-google-fonts/inter");
    expect(pkg).not.toContain("@expo-google-fonts/noto-serif");
    // Eski serif eşleme dosyaları silindi — geri eklenmemeli.
    const themeDir = path.join(__dirname, "..");
    const entries = await fs.readdir(themeDir);
    expect(entries.filter((f) => f.startsWith("serif-font"))).toEqual([]);
  });

  it("yasaklı font referansı yok (Tinos / Times New Roman / Noto Serif)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = path.join(__dirname, "..", "..");
    const hits: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.(ts|tsx|json)$/.test(e.name)) {
          const content = await fs.readFile(full, "utf-8");
          // Yorumlar elenir (dokümantasyon yasaklı adı anabilir), sonra kelime
          // sınırı aranır (interval/interaction gibi kelimeler elenir).
          const code = content
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|\s)\/\/.*$/gm, "$1")
            .replace(/\b(interval|interact\w*|internal|international|pointer|printer|winter|enter|interest\w*)\b/gi, "");
          if (/\bTinos\b/.test(code) || /Times New Roman/.test(code) || /Noto ?Serif/.test(code)) {
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
