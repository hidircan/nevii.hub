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

  it("islemler/yoklama: web yazma seti (Geldi/İşlendi/Telafi) + gerekçe akışı; Gelmedi/Mazeretli butonu YOK", async () => {
    const content = await admin("islemler/yoklama.tsx");
    // Web panel (Paket 6): sadece attended/processed/makeup yazılabilir —
    // "Mazeretli" diye bir yoklama statüsü yoktur (2026-10-30 owner).
    expect(content).toMatch(/"attended" \| "processed" \| "makeup"/);
    expect(content).toMatch(/reasonPrompt/);
    expect(content).toMatch(/lesReasonTitle/);
    expect(content).not.toMatch(/markAttendance\([^)]*"absent"/);
    expect(content).not.toMatch(/markAttendance\([^)]*"excused"/);
  });

  it("yoklama öğrenci araması sunucu `q` parametresiyle yapılır", async () => {
    const content = await admin("islemler/yoklama.tsx");
    expect(content).toMatch(/\/api\/v1\/students\?q=\$\{encodeURIComponent/);
    expect(content).not.toMatch(/toLocaleLowerCase\("tr-TR"\)\.includes\(q\)/);
  });
});

describe("ders detayı yoklama (web yazma seti — 2026-10-30)", () => {
  it("program/[lessonId]: attended/processed/makeup yazılır; Gelmedi/Mazeretli butonu YOK", async () => {
    const content = await admin("program/[lessonId].tsx");
    for (const flag of ["attended", "processed", "makeup"]) {
      expect(content, flag).toContain(`"${flag}"`);
    }
    // Web panel (Paket 6): "Gelmedi"/"Mazeretli" aksiyon butonları yok —
    // yalnız geçiş onayı metni için bayrak sözlüğü kalır.
    expect(content).not.toMatch(/markOps\("absent"\)/);
    expect(content).not.toMatch(/markOps\("excused"\)/);
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
