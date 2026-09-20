/**
 * Öğretmen salt-okunur yüzey sözleşmesi (statik route denetimi).
 * Kök neden: öğretmen mobilde yoklama alma, ders başlatma/bitirme ve
 * müsaitlik düzenleme/öneri aksiyonları görüyordu; web ile aynı yetki
 * modeline çekildi (yalnız kendi programını ve bilgisini görüntüler).
 * Sözleşme: (teacher) kapsamında bu üç mutasyon + CTA'lar YOK; yerine net
 * bilgi metinleri var. Admin yüzeyleri korunur.
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

describe("öğretmen salt-okunur yüzey sözleşmesi", () => {
  it("(teacher) kapsamında ders /ops yoklama mutasyonu YOK", async () => {
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

  it("(teacher) kapsamında ders başlat/bitir aksiyonu YOK", async () => {
    const files = await readAllTsx(path.join(APP_DIR, "(teacher)"));
    for (const { file, content } of files) {
      expect(content, `${file} ders başlat/bitir içeriyor`).not.toMatch(
        /Dersi başlat|Dersi bitir|lessons\/.*\/(start|end)|runLifecycle/
      );
    }
  });

  it("(teacher) kapsamında müsaitlik düzenleme/öneri formu YOK", async () => {
    const files = await readAllTsx(path.join(APP_DIR, "(teacher)"));
    for (const { file, content } of files) {
      expect(content, `${file} müsaitlik mutasyonu içeriyor`).not.toMatch(
        /availability\/propose|Öneriyi gönder|Yeni müsaitlik öner|buildProposedAvailability/
      );
    }
  });

  it("salt-okunur bilgi metinleri yerinde", async () => {
    const detail = await fs.readFile(path.join(APP_DIR, "(teacher)", "bugun", "[lessonId].tsx"), "utf-8");
    expect(detail).toContain("Yoklama yalnız kurum yöneticileri tarafından alınır.");
    const availability = await fs.readFile(path.join(APP_DIR, "(teacher)", "hesabim", "musaitlik.tsx"), "utf-8");
    expect(availability).toContain("Müsaitlik günleri yalnız kurum yöneticileri tarafından düzenlenir.");
  });

  it("admin yoklama akışı korunur (mutasyon + CTA'lar durur)", async () => {
    const content = await fs.readFile(path.join(APP_DIR, "(admin)", "islemler", "yoklama.tsx"), "utf-8");
    expect(content).toMatch(/lessons\/.*\/ops/);
    expect(content).toMatch(/label="Katıldı"/);
  });

  it("müsaitlik ekranında yazma çağrısı YOK (tamamen read-only)", async () => {
    const content = await fs.readFile(path.join(APP_DIR, "(teacher)", "hesabim", "musaitlik.tsx"), "utf-8");
    expect(content).not.toMatch(/\bapiPost\b|\bapiPatch\b|\bapiDelete\b/);
  });

  it("öğretmen ana paneli: Program/Öğrencilerim/Ödevler/Hakedişlerim; İş Takip ve Hesabım sekmede YOK", async () => {
    const layout = await fs.readFile(path.join(APP_DIR, "(teacher)", "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/name="hakedis"/);
    expect(layout).toMatch(/<Tabs\.Screen name="is-takip" options=\{\{ href: null \}\} \/>/);
    expect(layout).toMatch(/<Tabs\.Screen name="hesabim" options=\{\{ href: null \}\} \/>/);
    expect(layout).not.toMatch(/title: "İş Takip"|title: "Hesabım"/);
    // İş Takip Hesabım içinden açılır.
    const hesabim = await fs.readFile(path.join(APP_DIR, "(teacher)", "hesabim", "index.tsx"), "utf-8");
    expect(hesabim).toMatch(/"\/\(teacher\)\/is-takip"/);
  });

  it("öğretmen sekme köklerinde hesap ikonu zil sağında (showAccount)", async () => {
    for (const file of ["bugun/index.tsx", "ogrencilerim/index.tsx", "odevler/index.tsx"]) {
      const content = await fs.readFile(path.join(APP_DIR, "(teacher)", file), "utf-8");
      expect(content, file).toMatch(/showAccount="\/\(teacher\)\/hesabim"/);
    }
  });

  it("öğretmen kartlarında yoklama rozeti YOK, şube adı VAR", async () => {
    const index = await fs.readFile(path.join(APP_DIR, "(teacher)", "bugun", "index.tsx"), "utf-8");
    expect(index).not.toMatch(/Kapanış bekleyen/);
    expect(index).toMatch(/showStatus=\{false\}/);
    const card = await fs.readFile(
      path.join(__dirname, "..", "..", "components", "ui", "lesson-card.tsx"),
      "utf-8"
    );
    expect(card).toMatch(/lesson\.branchName/);
  });
});
