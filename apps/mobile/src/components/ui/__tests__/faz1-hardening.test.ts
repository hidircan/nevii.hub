/**
 * Faz 1 — küçük ekran / dokunma hedefi / dialog taşma sözleşmeleri (statik).
 *
 * - FilterChip: görsel yükseklik korunur, 44pt dokunma alanına `hitSlop`
 *   ile ulaşılır; ekran okuyucu için `accessibilityLabel` zorunlu.
 * - ConfirmDialog: uzun metin + büyük font + küçük ekranda kart taşmaz
 *   (`maxHeight`) — içerik `ScrollView` içinde kayar, aksiyonlar sabit kalır.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const UI = path.join(__dirname, "..");

async function src(rel: string): Promise<string> {
  return fs.readFile(path.join(UI, rel), "utf-8");
}

describe("filter-chip dokunma hedefi", () => {
  it("hitSlop ile efektif 44pt alan sağlar", async () => {
    const content = await src("filter-chip.tsx");
    expect(content).toMatch(/hitSlop=\{\{[^}]*top: 10[^}]*bottom: 10/);
  });

  it("ekran okuyucu etiketi label'dır", async () => {
    const content = await src("filter-chip.tsx");
    expect(content).toMatch(/accessibilityLabel=\{label\}/);
  });

  it("tek satır kırpma korunur", async () => {
    const content = await src("filter-chip.tsx");
    expect(content).toMatch(/numberOfLines=\{1\}/);
  });
});

describe("confirm-dialog taşma güvenliği", () => {
  it("kart yüksekliği sınırlıdır, içerik kayar", async () => {
    const content = await src("confirm-dialog.tsx");
    expect(content).toMatch(/maxHeight: "85%"/);
    expect(content).toMatch(/<ScrollView/);
    expect(content).toMatch(/showsVerticalScrollIndicator=\{false\}/);
  });

  it("aksiyon butonları kayan alanın dışındadır", async () => {
    const content = await src("confirm-dialog.tsx");
    const scrollEnd = content.indexOf("</ScrollView>");
    const actions = content.indexOf("styles.actions");
    expect(scrollEnd).toBeGreaterThan(0);
    expect(actions).toBeGreaterThan(scrollEnd);
  });
});
