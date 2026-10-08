/**
 * Ödeme ekranı sözleşmesi (statik).
 * Kural: liste sunucu-otriteli payment-ledger'dan beslenir; ay toplamları
 * sunucudan gelir (istemcide tahakkuk/ödeme hesabı yok); ay dökümü kimlik
 * doğrulamalı export ucundan indirilir; "Online öde" yalnız sunucu bayrağı
 * (onlinePayEnabled) + tahsil edilebilir durumdaysa görünür.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SCREEN = path.join(__dirname, "..", "payments-screen.tsx");

describe("ödeme ekranı sözleşmesi", () => {
  it("liste payment-ledger'dan beslenir, ay özetleri sunucudan gelir", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toMatch(/payment-ledger\?limit=/);
    expect(content).toMatch(/res\.data\.months/);
    expect(content).toMatch(/res\.data\.outstanding/);
    expect(content).not.toMatch(/\/balance/);
  });

  it("kalemlerde ders kırılımı gösterilir (sunucu zenginleştirmesi)", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toMatch(/p\.lesson/);
    expect(content).toMatch(/ledgerStatusBadge/);
  });

  it("export kimlik doğrulamalı uçtan indirilir, URL loglanmaz", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toMatch(/payment-ledger\/export/);
    expect(content).toMatch(/downloadAndOpenFile/);
    expect(content).not.toMatch(/console\.log.*export|Linking\.openURL.*export/);
  });

  it("Online öde yalnız sunucu bayrağıyla görünür", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    expect(content).toMatch(/onlinePayEnabled/);
    expect(content).toMatch(/canPayOnline/);
  });

  it("tahsilat sonrası tazeleme bağlanır (focus + foreground, TTL-bilinçli)", async () => {
    const content = await fs.readFile(SCREEN, "utf-8");
    // Otomatik tetikleyiciler TTL-bilinçli kanaldan (fresh ise istek yok);
    // manuel kanallar (pull-to-refresh / tekrar-dene) zorla-yenilemede kalır.
    expect(content).toMatch(/useFocusRefetch\(ledger\.autoRefresh\)/);
    expect(content).toMatch(/useAppForegroundRefetch\(ledger\.autoRefresh\)/);
    expect(content).toMatch(/onRetry=\{ledger\.refresh\}/);
    expect(content).toMatch(/onRefresh=\{res\.refresh\}/);
  });
});
