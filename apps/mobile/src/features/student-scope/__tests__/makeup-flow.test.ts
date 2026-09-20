/**
 * Telafi akışı sözleşmesi (statik).
 * Kural: liste + detay route'ları kayıtlı ve sekmede gizli; liste seçili
 * öğrenci ledger'ından beslenir; detay sahiplik kontrolü yapar (başka
 * çocuğun ID'sinde güvenli "bulunamadı"); ana sayfa bölümü detaya bağlanır.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..", "..");
const APP_DIR = path.join(__dirname, "..", "..", "..", "..", "app");

describe("telafi akışı sözleşmesi", () => {
  it.each(["(parent)", "(student)"])("%s: liste + detay route'ları kayıtlı, sekmede gizli", async (group) => {
    await fs.access(path.join(APP_DIR, group, "telafiler", "index.tsx"));
    await fs.access(path.join(APP_DIR, group, "telafiler", "[makeupId].tsx"));
    const layout = await fs.readFile(path.join(APP_DIR, group, "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/<Tabs\.Screen name="telafiler" options=\{\{ href: null \}\} \/>/);
  });

  it("liste seçili öğrenci ledger'ından beslenir, satırlar detaya açılır", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "makeup-screen.tsx"), "utf-8");
    expect(content).toMatch(/useSelectedStudentId/);
    expect(content).toMatch(/makeup-ledger/);
    expect(content).toMatch(/telafiler\/\$\{item\.id\}/);
    expect(content).toMatch(/Telafi kaydı bulunamadı/);
  });

  it("ana sayfa Telafi hakları detaya bağlanır", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "home-screen.tsx"), "utf-8");
    expect(content).toMatch(/telafiler\/\$\{m\.id\}/);
  });

  it("detayda uydurma gerekçe/not yok", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "makeup-screen.tsx"), "utf-8");
    expect(content).toMatch(/item\.reason/);
    expect(content).not.toMatch(/fake|mock|placeholder|örnek/i);
  });
});
