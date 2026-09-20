/**
 * Tipografi taşma sözleşmesi (statik).
 * Kural: +2pt sonrası dokunma hedefleri korunur (button 44, rozet kutusu
 * metni kapsar), sekme etiketleri serif 15pt, liste/kart metinleri kırpılır
 * (sessiz taşma yok), serif-regular üzerine kalınlık override'ı yok
 * (Android'de yanlış kesit bozar).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..");
const APP_DIR = path.join(__dirname, "..", "..", "..", "app");

async function src(rel: string): Promise<string> {
  return fs.readFile(path.join(SRC, rel), "utf-8");
}

describe("tipografi taşma sözleşmesi", () => {
  it("button: etiket 17/15 serif + 44pt hedef korunur", async () => {
    const content = await src("components/ui/button.tsx");
    expect(content).toMatch(/fontFamily: t\.fonts\.serifBold/);
    expect(content).toMatch(/fontSize: size === "sm" \? 15 : 17/);
    expect(content).toMatch(/minHeight: 44/);
    expect(content).toMatch(/numberOfLines=\{2\}/);
  });

  it("sekme etiketleri: serif 15pt (4 portal)", async () => {
    for (const group of ["(student)", "(parent)", "(teacher)", "(admin)"]) {
      const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
      expect(layout, group).toMatch(/tabBarLabelStyle: \{ fontFamily: fonts\.serif, fontSize: 15 \}/);
    }
  });

  it("girdi/rozet/çip ölçüleri +2pt", async () => {
    expect(await src("components/ui/text-field.tsx")).toMatch(/fontFamily: fonts\.serif, fontSize: 17/);
    expect(await src("components/ui/search-input.tsx")).toMatch(/fontFamily: fonts\.serif, fontSize: 17/);
    expect(await src("components/ui/status-badge.tsx")).toMatch(/fontFamily: fonts\.serifBold, fontSize: 14/);
    expect(await src("components/ui/filter-chip.tsx")).toMatch(/fontFamily: fonts\.serifBold, fontSize: 15/);
  });

  it("bildirim rozet kutusu 12pt metni kapsar", async () => {
    const content = await src("components/ui/app-header.tsx");
    expect(content).toMatch(/minWidth: 20/);
    expect(content).toMatch(/fontFamily: fonts\.serifBold, fontSize: 12/);
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

  it("serif-regular üzerine 600/700 override yok (Android kesit güvenliği)", async () => {
    const offenders: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (/\.tsx$/.test(e.name)) {
          const content = await fs.readFile(full, "utf-8");
          const re = /t\.typography\.(body|caption), \{([^}]*)\}/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(content))) {
            if (/fontWeight: "(600|700)"/.test(m[2]) && !/fontFamily: t\.fonts\.serifBold/.test(m[2])) {
              offenders.push(`${path.relative(SRC, full)}: ${m[0].slice(0, 80)}`);
            }
          }
        }
      }
    }
    await walk(SRC);
    await walk(APP_DIR);
    expect(offenders).toEqual([]);
  });
});
