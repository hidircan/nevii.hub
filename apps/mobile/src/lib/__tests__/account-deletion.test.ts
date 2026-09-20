/**
 * Faz 6 — hesap silme akışı sözleşmeleri (statik).
 *
 * - Yasal satırlar gerçek URL açar / gerçek ekrana gider (ölü satır YOK).
 * - Silme ekranı: güçlü onay + sunucu talebi + durum + geri çekme.
 * - Admin: liste + karar akışı; işlemler menüsünde satır + stack kaydı.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const MOBILE = path.join(__dirname, "..", "..", "..");

async function mobile(rel: string): Promise<string> {
  return fs.readFile(path.join(MOBILE, rel), "utf-8");
}

describe("hesabım yasal satırları", () => {
  it("gizlilik/kullanım URL açar, silme ekrana gider", async () => {
    const content = await mobile("src/features/account/account-screen.tsx");
    expect(content).toMatch(/Linking\.openURL\(links\.privacyPolicyUrl\)/);
    expect(content).toMatch(/Linking\.openURL\(links\.termsUrl\)/);
    expect(content).toMatch(/router\.push\("\/hesap-silme-talebi"\)/);
    expect(content).not.toMatch(/kurumunuzdan isteyin/);
  });
});

describe("silme talep ekranı", () => {
  it("onay + talep + durum + geri çekme", async () => {
    const content = await mobile("app/hesap-silme-talebi.tsx");
    expect(content).toContain("/api/v1/account/deletion-request");
    expect(content).toContain("/api/v1/account/deletion-request/cancel");
    expect(content).toMatch(/accessibilityRole="checkbox"/);
    expect(content).toMatch(/confirm: true/);
    expect(content).toMatch(/Talebi geri çek/);
  });

  it("kök stack'e kayıtlıdır", async () => {
    expect(await mobile("app/_layout.tsx")).toContain('<Stack.Screen name="hesap-silme-talebi" />');
  });
});

describe("admin silme talepleri", () => {
  it("liste + karar akışı", async () => {
    const content = await mobile("app/(admin)/islemler/silme-talepleri.tsx");
    expect(content).toContain("/api/v1/account/deletion-requests");
    expect(content).toContain("/api/v1/account/deletion-requests/decide");
    expect(content).toMatch(/İşlendi işaretle/);
  });

  it("menü satırı + stack kaydı", async () => {
    expect(await mobile("app/(admin)/islemler/index.tsx")).toContain("/(admin)/islemler/silme-talepleri");
    expect(await mobile("app/(admin)/islemler/_layout.tsx")).toContain('<Stack.Screen name="silme-talepleri" />');
  });
});
