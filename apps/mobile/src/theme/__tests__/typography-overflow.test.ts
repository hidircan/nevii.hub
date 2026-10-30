/**
 * Tipografi taşma sözleşmesi (statik).
 * Kural: dokunma hedefleri korunur (button 44, rozet kutusu metni kapsar),
 * sekme etiketleri 13pt Inter + 2 satır sarma, liste/kart metinleri kırpılır
 * (sessiz taşma yok), Inter-regular üzerine uyumsuz kalınlık override'ı yok,
 * TÜM metin `AppText` üzerinden çizilir (maxFontSizeMultiplier 1.3,
 * allowFontScaling açık, flexShrink 1).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");
const APP_DIR = path.join(__dirname, "..", "..", "..", "app");

async function src(rel: string): Promise<string> {
  return fs.readFile(path.join(SRC, rel), "utf-8");
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (/\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("tipografi taşma sözleşmesi", () => {
  it("button: etiket 17/15 Inter semibold + 44pt hedef korunur", async () => {
    const content = await src("components/ui/button.tsx");
    expect(content).toMatch(/fontFamily: t\.fonts\.semibold/);
    expect(content).toMatch(/fontSize: size === "sm" \? 15 : 17/);
    expect(content).toMatch(/minHeight: 44/);
    expect(content).toMatch(/numberOfLines=\{2\}/);
  });

  it("sekme etiketleri: ortak TabBarLabel (12pt/15 tek satır, 4 portal)", async () => {
    const label = await src("components/ui/tab-bar-label.tsx");
    expect(label).toMatch(/fontFamily: t\.fonts\.medium/);
    expect(label).toMatch(/fontSize: 12/);
    expect(label).toMatch(/lineHeight: 15/);
    expect(label).toMatch(/numberOfLines=\{1\}/);
    expect(label).toContain("<AppText");
    for (const group of ["(student)", "(parent)", "(teacher)", "(admin)"]) {
      const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
      expect(layout, group).toContain("<TabBarLabel color={color}>{children}</TabBarLabel>");
      // Alt çubuk yüksekliği/paylaşımı TEK kaynaktan (tab-bar.tsx) gelir —
      // layout'ta sabit minHeight:64 ve manuel paddingBottom YOK (İş 1).
      expect(layout, group).toMatch(/usePortalTabBarStyle\(/);
      expect(layout, group).not.toMatch(/minHeight: 64/);
    }
  });

  it("girdi/rozet/çip ölçüleri Inter ile korunur", async () => {
    expect(await src("components/ui/text-field.tsx")).toMatch(/fontFamily: fonts\.regular, fontSize: 17/);
    expect(await src("components/ui/search-input.tsx")).toMatch(/fontFamily: fonts\.regular, fontSize: 17/);
    expect(await src("components/ui/badge-style.ts")).toMatch(/fontFamily: fonts\.bold, fontSize: 14/);
    expect(await src("components/ui/filter-chip.tsx")).toMatch(/fontFamily: fonts\.semibold, fontSize: 15/);
  });

  it("bildirim rozet kutusu 12pt metni kapsar", async () => {
    const content = await src("components/ui/app-header.tsx");
    expect(content).toMatch(/minWidth: 20/);
    expect(content).toMatch(/fontFamily: fonts\.bold, fontSize: 12/);
  });

  it("liste/kart satırları kırpılır (uzun Türkçe metin taşmaz)", async () => {
    for (const file of [
      "components/ui/lesson-card.tsx",
      "components/ui/homework-card.tsx",
      "components/ui/notification-card.tsx",
      "components/ui/task-card.tsx",
      "components/ui/list-row.tsx",
    ]) {
      expect(await src(file), file).toMatch(/numberOfLines=\{/);
    }
  });

  it("AppText: tek metin bileşeni — 1.3 üst sınır, ölçekleme açık, flexShrink", async () => {
    const content = await src("components/ui/app-text.tsx");
    expect(content).toMatch(/MAX_FONT_SIZE_MULTIPLIER = 1\.3/);
    expect(content).toMatch(/allowFontScaling = true/);
    expect(content).toMatch(/flexShrink: 1/);
    expect(content).toMatch(/ellipsizeMode = "tail"/);
  });

  it("react-native'den doğrudan Text import EDİLMEZ (tek yol AppText)", async () => {
    const offenders: string[] = [];
    for (const file of [...(await walk(SRC)), ...(await walk(APP_DIR))]) {
      if (file.endsWith(path.join("components", "ui", "app-text.tsx"))) continue;
      const content = await fs.readFile(file, "utf-8");
      const imports = [...content.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native";/g)];
      for (const m of imports) {
        const names = m[1].split(",").map((s) => s.trim());
        if (names.includes("Text")) offenders.push(path.relative(SRC, file));
      }
      if (/<Text[\s>]/.test(content)) offenders.push(`${path.relative(SRC, file)}: <Text>`);
    }
    expect(offenders).toEqual([]);
  });

  it("Inter-regular üzerine 600/700 override yok (kesit güvenliği)", async () => {
    const offenders: string[] = [];
    for (const file of [...(await walk(SRC)), ...(await walk(APP_DIR))]) {
      const content = await fs.readFile(file, "utf-8");
      const re = /(?:t\.)?fonts\.regular[^}]*fontWeight: "(600|700)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) offenders.push(`${path.relative(SRC, file)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
