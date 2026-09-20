/**
 * Faz 3 — admin P1 (finans/duyuru/onay) sözleşmeleri (statik).
 *
 * - Finans özeti `payments/summary`'den gelir; istemcide tutar hesabı YOK.
 * - Tahsilat vaka ilerletme hatası görünür.
 * - Duyuru alıcı sayısı sayfa boyutu DEĞİL sunucu `total`'ıdır.
 * - İzin onayları: liste + onay/ret (onaylı dialog) + hata kartı.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const OPS = path.join(__dirname, "..", "..", "..", "app", "(admin)", "islemler");

async function ops(rel: string): Promise<string> {
  return fs.readFile(path.join(OPS, rel), "utf-8");
}

describe("finans özeti", () => {
  it("finans.tsx summary uçunu kullanır, hesap yapmaz", async () => {
    const content = await ops("finans.tsx");
    expect(content).toContain("/api/v1/payments/summary");
    expect(content).not.toContain("/api/v1/dashboard/summary");
    expect(content).not.toMatch(/\.reduce\(\(s, p\)/);
    expect(content).toMatch(/Bugün tahsilat/);
    expect(content).toMatch(/Gecikmiş/);
  });

  it("tahsilat detayına drill-down vardır", async () => {
    const content = await ops("finans.tsx");
    expect(content).toContain('router.push("/(admin)/islemler/tahsilat")');
  });
});

describe("tahsilat hata görünürlüğü", () => {
  it("vaka ilerletme hatası karta yazılır", async () => {
    const content = await ops("tahsilat.tsx");
    expect(content).toMatch(/Durum güncellenemedi/);
    expect(content).toMatch(/if \(!result\.ok\)/);
  });
});

describe("duyuru alıcı sayısı", () => {
  it("total kullanılır, sayfa uzunluğu değil", async () => {
    const content = await ops("duyurular/yeni.tsx");
    expect(content).toMatch(/teachers\.data\.total \?\? teachers\.data\.teachers\.length/);
    expect(content).toMatch(/students\.data\.total \?\? students\.data\.students\.length/);
  });
});

describe("izin onayları", () => {
  it("izinler ekranı liste + karar akışına sahiptir", async () => {
    const content = await ops("izinler.tsx");
    expect(content).toContain('"/api/v1/leave"');
    expect(content).toMatch(/\/api\/v1\/leave\/\$\{item\.id\}\/decide/);
    expect(content).toMatch(/İzin onaylansın mı\?/);
    expect(content).toMatch(/Karar kaydedilemedi/);
  });

  it("işlemler menüsünde izin satırı + stack kaydı vardır", async () => {
    expect(await ops("index.tsx")).toContain("/(admin)/islemler/izinler");
    expect(await ops("_layout.tsx")).toContain('<Stack.Screen name="izinler" />');
  });
});
