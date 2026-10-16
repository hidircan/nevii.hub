import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import baseline from "./egress-full-read-baseline.json";

/**
 * Supabase egress kuralı (2026-10-16, owner: "kotaya asla takılmak istemiyorum") — CIRCIR (ratchet).
 *
 * `readData()` / `readScopedData(` kurumun TÜM ders/ödeme/öğrenci/yoklama verisini okur (canlıda istek başına
 * ~2 MB). Bu test her dosyadaki tam okuma sayısını taban çizgisiyle karşılaştırır:
 * - YENİ bir dosyada tam okuma veya sayının ARTMASI → test kırılır. Dar dilim kullanın
 *   (`src/lib/reference-data.ts`, `readScoped*`, `read*ById`, `readLessonsStartingBetween`); gerçekten
 *   gerekiyorsa gerekçesini PR'da yazıp taban çizgisini bilinçli güncelleyin.
 * - Sayı AZALDIYSA taban çizgisini düşürün (aşağıdaki mesaj yeni değeri verir) — geri kayma olmasın.
 * Ayrıntı: CLAUDE.md "Read only what the screen needs" ve `.claude/skills/nevii-hub/SKILL.md` §7.
 */
const PATTERN = /\breadData\(\)|\breadScopedData\(/g;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") out.push(...(await walk(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function countFullReads(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const file of await walk("src")) {
    const text = await fs.readFile(file, "utf8");
    const n = text
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .reduce((sum, line) => sum + (line.match(PATTERN)?.length ?? 0), 0);
    if (n > 0) counts[file.split(path.sep).join("/")] = n;
  }
  return counts;
}

describe("Supabase egress — tam kurum okuması artmaz (cırcır)", () => {
  it("hiçbir dosyada readData()/readScopedData( sayısı taban çizgisini aşmaz", async () => {
    const allowed = baseline as Record<string, number>;
    const counts = await countFullReads();
    const grew = Object.entries(counts)
      .filter(([file, n]) => n > (allowed[file] ?? 0))
      .map(([file, n]) => `${file}: ${allowed[file] ?? 0} → ${n}`);
    expect(grew, `Yeni tam kurum okuması eklendi (dar dilim kullanın):\n${grew.join("\n")}`).toEqual([]);
  });

  it("azalan sayılar taban çizgisine işlenir (kazanım geri kaybolmasın)", async () => {
    const allowed = baseline as Record<string, number>;
    const counts = await countFullReads();
    const shrank = Object.entries(allowed)
      .filter(([file, n]) => (counts[file] ?? 0) < n)
      .map(([file]) => `"${file}": ${counts[file] ?? 0}`);
    expect(shrank, `Taban çizgisini düşürün (egress-full-read-baseline.json):\n${shrank.join("\n")}`).toEqual([]);
  });
});
