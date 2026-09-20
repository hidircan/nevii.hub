/**
 * Faz 4 — admin P2 (rapor/ayarlar) sözleşmeleri (statik).
 *
 * - Özet/ödev-raporu/katalog ekranları gerçek uçları tüketir.
 * - Admin Hesabım: bildirim + e-posta + şifre + çıkış (kurulum
 *   ayarları web-only; sahte edit formu YOK).
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const ADMIN = path.join(__dirname, "..", "..", "..", "app", "(admin)");

async function admin(rel: string): Promise<string> {
  return fs.readFile(path.join(ADMIN, rel), "utf-8");
}

describe("kritik raporlar gerçek uçtadır", () => {
  it("ozet dashboard/summary kullanır", async () => {
    expect(await admin("ozet.tsx")).toContain('"/api/v1/dashboard/summary"');
  });

  it("odev-raporu homework/report kullanır", async () => {
    expect(await admin("islemler/odev-raporu.tsx")).toContain('"/api/v1/homework/report"');
  });

  it("katalog instruments kullanır + web-only notu vardır", async () => {
    const content = await admin("islemler/katalog.tsx");
    expect(content).toContain('"/api/v1/instruments"');
    expect(content).toMatch(/web panelini kullanın/);
  });

  it("hakedis mark-paid ucu kullanılır", async () => {
    const content = await admin("kisiler/ogretmen/[id]/hakedis.tsx");
    expect(content).toMatch(/\/api\/v1\/teachers\/payouts\/\$\{payoutId\}\/mark-paid/);
  });
});

describe("admin hesap ayarları", () => {
  it("hesabim menüsünde bildirim + e-posta + şifre", async () => {
    const content = await admin("hesabim/index.tsx");
    expect(content).toContain("/(admin)/hesabim/bildirim-tercihleri");
    expect(content).toContain("/(admin)/hesabim/e-posta-degistir");
    expect(content).toContain("/(admin)/hesabim/sifre-degistir");
  });

  it("şifre/e-posta ekranları ortak bileşeni kullanır (duplikasyon YOK)", async () => {
    expect(await admin("hesabim/sifre-degistir.tsx")).toContain("ChangePasswordScreen");
    expect(await admin("hesabim/e-posta-degistir.tsx")).toContain("ChangeEmailScreen");
  });

  it("stack kaydı vardır", async () => {
    const layout = await admin("hesabim/_layout.tsx");
    expect(layout).toContain('<Stack.Screen name="sifre-degistir" />');
    expect(layout).toContain('<Stack.Screen name="e-posta-degistir" />');
  });
});
