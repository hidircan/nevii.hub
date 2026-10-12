/**
 * Faz 9 — tema/koyu-mod sözleşmeleri (statik).
 *
 * Sekme çubuğu renkleri temadan gelir (koyu modda okunurluk);
 * hardcoded hex YASAK (gölge rengi gibi platform sabitleri hariç değil —
 * onlar da tema dışıysa test yakalar; istisna listede).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const APP = path.join(__dirname, "..", "..", "..", "app");

const LAYOUTS = [
  "(parent)/_layout.tsx",
  "(student)/_layout.tsx",
  "(teacher)/_layout.tsx",
  "(admin)/_layout.tsx",
];

describe("sekme çubuğu tema renkleri", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: aktif renk temadan`, async () => {
      const content = await fs.readFile(path.join(APP, layout), "utf-8");
      expect(content).toMatch(/tabBarActiveTintColor: t\.colors\./);
      expect(content).not.toMatch(/tabBarActiveTintColor: "#/);
    });
  }

  it("lesson-card zaman bloğu temadan", async () => {
    const content = await fs.readFile(
      path.join(__dirname, "..", "..", "components", "ui", "lesson-card.tsx"),
      "utf-8"
    );
    expect(content).toMatch(/backgroundColor: t\.colors\.bgMuted/);
    expect(content).not.toMatch(/#8787843b/);
  });
});
