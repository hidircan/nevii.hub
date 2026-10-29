/**
 * Faz 1 — logout/cihaz-paylaşım hijyeni sözleşmeleri (statik).
 *
 * Veli çocuk-seçimi `userId` ad-alanlı tek anahtarda tutulur
 * (`selected-store.ts`); logout'ta silinir. Yeniden girişte seçim sunucu
 * listesinden (`my-children`) temiz kurulur — eski öğrencinin verisi
 * paylaşımlı cihazda ASLA dirilmez.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const STUDENT = path.join(__dirname, "..");
const AUTH = path.join(__dirname, "..", "..", "auth", "auth-context.tsx");

describe("seçim persist anahtarı", () => {
  it("tek tanım, userId ad-alanlıdır", async () => {
    const content = await fs.readFile(path.join(STUDENT, "selected-store.ts"), "utf-8");
    expect(content).toContain("neviichub_selected_student:${userId}");
    expect(content).toMatch(/export async function clearSelectedStudent/);
    expect(content).toMatch(/deleteItemAsync/);
  });

  it("student-context yerel anahtar tanımı KULLANMAZ", async () => {
    const content = await fs.readFile(path.join(STUDENT, "student-context.tsx"), "utf-8");
    expect(content).toContain('from "./selected-store"');
    expect(content).not.toMatch(/function selectedKey\(/);
    expect(content).not.toContain("neviichub_selected_student:${userId}");
  });
});

describe("logout temizliği", () => {
  it("logout çıkış yapan kullanıcının seçimini temizler", async () => {
    const content = await fs.readFile(AUTH, "utf-8");
    expect(content).toContain('from "../student/selected-store"');
    expect(content).toMatch(/const signedOutUserId = user\?\.userId \?\? null/);
    expect(content).toMatch(/if \(signedOutUserId\) await clearSelectedStudent\(signedOutUserId\)/);
  });

  it("seçim temizliği signOutLocally ÖNCESİ yapılır", async () => {
    const content = await fs.readFile(AUTH, "utf-8");
    const logoutBody = content.slice(content.indexOf("async logout()"));
    expect(logoutBody.indexOf("clearSelectedStudent(signedOutUserId)")).toBeLessThan(
      logoutBody.indexOf("signOutLocally()")
    );
  });
});
