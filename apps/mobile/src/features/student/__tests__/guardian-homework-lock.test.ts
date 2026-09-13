import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * Guardian ödev davranış kilidi — LEGACY CONTRACT.
 *
 * `src/features/student-scope/homework-screen.tsx` ortak dosyadır (Claude
 * sahipliği); bu test dosyayı DEĞİŞTİRMEZ, yalnız mevcut davranışı kilitler:
 * teslim akışı `user?.role === "STUDENT"` kapısıyla öğrenciye özeldir,
 * veliye salt-görünüm mesajı gösterilir.
 *
 * Claude commit'i cherry-pick edildikten sonra `personaOf(user)` +
 * `user.portalAccessType` (STUDENT+SELF / STUDENT+GUARDIAN) contract'ına
 * geçilecek ve legacy `user.role === "PARENT"` kontrolü kaldırılacak —
 * O FOLLOW-UP'TA BU TEST GÜNCELLENECEK (bkz. handoff "Claude Sonrası
 * Follow-Up"). O zamana kadar bu kilit, guardian'ın submit yapamadığını
 * garanti eder.
 */

const HOMEWORK_SCREEN = path.join(__dirname, "../../student-scope/homework-screen.tsx");

describe("guardian ödev davranış kilidi (legacy)", () => {
  it("teslim akışı STUDENT rolüne kapılıdır", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).toContain('user?.role === "STUDENT"');
  });

  it("veliye salt-görünüm açıklaması gösterilir", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).toContain("PARENT");
    expect(content).toMatch(/yalnızca öğrencinin kendi hesabından yapılabilir/i);
  });

  it("veli için dosya yükleme akışı yoktur (fake upload yok)", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).not.toMatch(/DocumentPicker|launchImageLibrary|upload-homework|homework.*upload/i);
  });
});
