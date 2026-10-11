/**
 * Devam raporu sözleşmesi (statik).
 * Kural: rapor route'ları kayıtlı + sekmede gizli; ana sayfa "Devam durumu"
 * ve Gelişim sayaçları filtreli rapora bağlanır; liste sunucu-otriteli
 * attendance-ledger'dan beslenir (istemcide statü uydurma yok).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..", "..");
const APP_DIR = path.join(__dirname, "..", "..", "..", "..", "app");

describe("devam raporu sözleşmesi", () => {
  it.each(["(parent)", "(student)"])("%s: rapor route'u kayıtlı ve sekmede gizli", async (group) => {
    await fs.access(path.join(APP_DIR, group, "devam-raporu.tsx"));
    const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/<Tabs\.Screen name="devam-raporu" options=\{\{ href: null \}\} \/>/);
  });

  it("ana sayfa Devam durumu rapora bağlanır", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "home-screen.tsx"), "utf-8");
    expect(content).toMatch(/devam-raporu/);
  });

  it("Gelişim sayaçları filtreli rapora bağlanır", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "gelisim-screen.tsx"), "utf-8");
    expect(content).toMatch(/devam-raporu\?status=/);
    expect(content).toMatch(/attendance-ledger\?direction=past/);
  });

  it("rapor listesi sunucu-otriteli ledger'dan beslenir", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "attendance-report-screen.tsx"), "utf-8");
    expect(content).toMatch(/attendance-ledger/);
    expect(content).toMatch(/FlatList/);
    expect(content).toMatch(/useFocusRefetch/);
    expect(content).toMatch(/useAppForegroundRefetch/);
  });

  it("raporda operasyon jargonu üretilmez", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "attendance-report-screen.tsx"), "utf-8");
    expect(content).not.toMatch(/Yoklama bekliyor/);
    const display = await fs.readFile(path.join(SRC, "lib", "attendance-display.ts"), "utf-8");
    expect(display).not.toMatch(/"Yoklama bekliyor"/);
  });
});
