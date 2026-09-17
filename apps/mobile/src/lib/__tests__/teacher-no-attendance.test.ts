/**
 * Öğretmen yoklama kaldırma sözleşmesi (statik route denetimi).
 * Kök neden: öğretmen ders detayında yoklama mutasyonu + CTA'lar.
 * Sözleşme: (teacher) kapsamında `POST /api/v1/lessons/:id/ops` çağrısı ve
 * yoklama işaretleme UI'ı YOK; admin yoklama akışı korunur.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const APP_DIR = path.join(__dirname, "..", "..", "..", "app");

async function readAllTsx(dir: string): Promise<Array<{ file: string; content: string }>> {
  const out: Array<{ file: string; content: string }> = [];
  async function walk(current: string, rel: string) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) await walk(full, relPath);
      else if (entry.name.endsWith(".tsx")) out.push({ file: relPath, content: await fs.readFile(full, "utf-8") });
    }
  }
  await walk(dir, "");
  return out;
}

describe("öğretmen yoklama kaldırma sözleşmesi", () => {
  it("(teacher) kapsamında ders /ops mutasyon çağrısı YOK", async () => {
    const files = await readAllTsx(path.join(APP_DIR, "(teacher)"));
    expect(files.length).toBeGreaterThan(0);
    for (const { file, content } of files) {
      expect(content, `${file} yoklama mutasyonu içeriyor`).not.toMatch(/lessons\/.*\/ops/);
    }
  });

  it("(teacher) kapsamında yoklama işaretleme UI'ı YOK (Katıldı/Gelmedi/İzinli CTA)", async () => {
    const files = await readAllTsx(path.join(APP_DIR, "(teacher)"));
    for (const { file, content } of files) {
      expect(content, `${file} yoklama CTA içeriyor`).not.toMatch(/label="Katıldı"|label="Gelmedi"|label="İzinli"|title="Yoklama"/);
    }
  });

  it("admin yoklama akışı korunur (mutasyon + CTA'lar durur)", async () => {
    const content = await fs.readFile(path.join(APP_DIR, "(admin)", "islemler", "yoklama.tsx"), "utf-8");
    expect(content).toMatch(/lessons\/.*\/ops/);
    expect(content).toMatch(/label="Katıldı"/);
  });
});
