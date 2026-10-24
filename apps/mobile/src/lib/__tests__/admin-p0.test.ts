/**
 * Faz 2 — admin P0 saha operasyon sözleşmeleri (statik).
 *
 * - Yoklama + ders detayı: hata görünür, statü geçişi sunucu onayıyla
 *   (needsConfirmation), sessiz üzerine yazma yok.
 * - Telafi/İşlendi gerekçesiz gönderilmez (sunucu zorunlu kılar).
 * - Kişiler araması sunucu tarafında (`q`); tüm liste çekilip
 *   istemcide filtrelenmez.
 * - Portal erişimi: liste + iptal (onaylı) + yeniden açma + davet.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const APP = path.join(__dirname, "..", "..", "..", "app", "(admin)");

async function admin(rel: string): Promise<string> {
  return fs.readFile(path.join(APP, rel), "utf-8");
}

describe("yoklama hata + onay akışı", () => {
  it("islemler/yoklama: hata kartı + needsConfirmation + confirmSwitch", async () => {
    const content = await admin("islemler/yoklama.tsx");
    expect(content).toMatch(/setOpsError\(res\.error\.message/);
    expect(content).toMatch(/needsConfirmation/);
    expect(content).toMatch(/confirmSwitch/);
    expect(content).toMatch(/lesSwitchTitle/);
    expect(content).not.toMatch(/await apiPost\(`\/api\/v1\/lessons\/\$\{lessonId\}\/ops`, \{ flag \}\);\n    setBusyLessonId\(null\);\n    schedule\.refresh/);
  });

  it("yoklama öğrenci araması sunucu `q` parametresiyle yapılır", async () => {
    const content = await admin("islemler/yoklama.tsx");
    expect(content).toMatch(/\/api\/v1\/students\?q=\$\{encodeURIComponent/);
    expect(content).not.toMatch(/toLocaleLowerCase\("tr-TR"\)\.includes\(q\)/);
  });
});

describe("ders detayı yoklama (iptal üretimi kaldırıldı — 2026-10-16)", () => {
  it("program/[lessonId]: 5 ops bayrağı + gerekçe akışı; iptal düğmesi/uç noktası YOK", async () => {
    const content = await admin("program/[lessonId].tsx");
    for (const flag of ["attended", "absent", "excused", "makeup", "processed"]) {
      expect(content, flag).toContain(`"${flag}"`);
    }
    expect(content).not.toContain("/cancel`");
    expect(content).not.toMatch(/lesCancelConfirm|lesCancelTitle|confirmingCancel/);
    expect(content).toMatch(/reasonPrompt/);
    expect(content).toMatch(/lesReasonTitle/);
  });

  it("iptal edilmiş derste yoklama butonu YOK", async () => {
    const content = await admin("program/[lessonId].tsx");
    expect(content).toMatch(/lesson\.status === "cancelled"/);
    expect(content).toMatch(/lesCancelled/);
  });
});

describe("kişiler sunucu araması", () => {
  it("kisiler/index: `q` sunucuya gider, istemci filtresi YOK", async () => {
    const content = await admin("kisiler/index.tsx");
    expect(content).toMatch(/\/api\/v1\/students\$\{qParam\}/);
    expect(content).toMatch(/\/api\/v1\/teachers\$\{qParam\}/);
    expect(content).not.toMatch(/toLocaleLowerCase\("tr-TR"\)\.includes\(/);
  });

  it("kisiler/index: FlatList + sayfalı 'daha fazla' (Faz 9)", async () => {
    const content = await admin("kisiler/index.tsx");
    expect(content).toMatch(/<FlatList/);
    expect(content).toMatch(/peopleMore/);
    expect(content).toMatch(/limit=\$\{limit\}/);
  });
});

describe("öğrenci detay portal erişimi", () => {
  it("portal erişimi listesi + iptal/yeniden-açma/davet", async () => {
    const content = await admin("kisiler/ogrenci/[id].tsx");
    expect(content).toContain("/portal-access`");
    expect(content).toMatch(/portal-access\/\$\{action\}/);
    expect(content).toMatch(/action: "revoke" \| "reactivate"/);
    expect(content).toContain("/portal-access/invite");
    expect(content).toMatch(/stuRevokeTitle/);
    expect(content).toMatch(/stuSendInvite/);
  });

  it("veli telefonu tap-to-call'dir", async () => {
    const content = await admin("kisiler/ogrenci/[id].tsx");
    expect(content).toMatch(/Linking\.openURL\(telHref\(/);
    expect(content).toMatch(/stuCallA11y/);
  });

  it("ödeme onayı hata gösterir", async () => {
    const content = await admin("kisiler/ogrenci/[id].tsx");
    expect(content).toMatch(/stuPayFail/);
  });
});
