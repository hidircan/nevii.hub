/**
 * Sözleşmelerim sözleşmesi (statik + backend negatif kilitleri).
 * Kural: yalnız seçili öğrencinin sözleşmeleri; deep-link/param ile başka
 * çocuğun sözleşmesi açılamaz (liste ön-kontrol + sunucu `assertStudentAccess`
 * / `canAccessStudent`); belge paylaşımı yalnız gerçek imzalı nüshada.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(__dirname, "..", "..", "..");
const APP_DIR = path.join(__dirname, "..", "..", "..", "..", "app");

describe("sözleşmelerim sözleşmesi", () => {
  it("liste seçili öğrenci bağlamından beslenir", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "contracts-screen.tsx"), "utf-8");
    expect(content).toMatch(/useSelectedStudentId/);
    expect(content).toMatch(/\/api\/v1\/students\/\$\{studentId\}\/contracts/);
    expect(content).not.toMatch(/useLocalSearchParams/);
  });

  it("detay sahiplik ön-kontrolü yapar; yetkisizde güvenli hata", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "contracts-screen.tsx"), "utf-8");
    expect(content).toMatch(/!owned/);
    expect(content).toMatch(/contracts\.noAccess/);
    expect(content).toMatch(/\/api\/v1\/contracts\/\$\{contractId\}/);
  });

  it("belge paylaşımı yalnız documentInstanceId varsa; istemcide belge üretilmez", async () => {
    const content = await fs.readFile(path.join(SRC, "features", "student-scope", "contracts-screen.tsx"), "utf-8");
    expect(content).toMatch(/contract\.documentInstanceId \?/);
    expect(content).toMatch(/signed-file/);
    expect(content).not.toMatch(/PDF.?e aktar|printToFile|Print\.print/i);
  });

  it.each(["(parent)", "(student)"])("%s: liste + detay route'ları kayıtlı", async (group) => {
    for (const file of ["sozlesmeler/index.tsx", "sozlesmeler/[contractId].tsx"]) {
      await fs.access(path.join(APP_DIR, group, file));
    }
  });

  it.each(["(parent)", "(student)"])("%s: Hesabım'da Sözleşmelerim kısayolu", async (group) => {
    const content = await fs.readFile(path.join(APP_DIR, group, "hesabim", "index.tsx"), "utf-8");
    expect(content).toMatch(/key: "sozlesmeler"/);
    expect(content).toMatch(/links\.myContracts/);
  });
});
