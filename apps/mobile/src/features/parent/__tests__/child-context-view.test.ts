import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { PARENT_QUICK_LINKS, toChildContextView } from "../child-context";
import type { StudentProfile } from "../../../types/api";

const APP_PARENT_DIR = path.join(__dirname, "../../../../app/(parent)");

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: "s1",
    name: "Test Öğrenci",
    instruments: ["Piyano"],
    teacherId: "t1",
    teacherName: "Test Öğretmen",
    packageName: "Standart Paket",
    weeklyLessonCount: 2,
    phone: "0500",
    parentName: "Test Veli",
    parentPhone: "0501",
    communicationOptOut: false,
    photoPath: null,
    ...overrides,
  };
}

describe("toChildContextView", () => {
  it("aktif bağlamı ad + satırlarla kurar", () => {
    const view = toChildContextView(profile())!;
    expect(view.name).toBe("Test Öğrenci");
    expect(view.line1).toContain("Piyano");
    expect(view.line1).toContain("Test Öğretmen");
    expect(view.line2).toContain("Standart Paket");
  });

  it("ad yoksa null döner (yanlış isim gösterilmez, fake child yok)", () => {
    expect(toChildContextView(null)).toBeNull();
    expect(toChildContextView(undefined)).toBeNull();
    expect(toChildContextView(profile({ name: "" }))).toBeNull();
    expect(toChildContextView(profile({ name: "   " }))).toBeNull();
  });

  it("eksik opsiyonel alanlarda crash olmaz", () => {
    const view = toChildContextView(profile({ teacherName: undefined, packageName: "", weeklyLessonCount: 0 }))!;
    expect(view.name).toBe("Test Öğrenci");
    expect(view.line2).toBe("");
  });

  it("görünümde PII taşımaz (telefon/e-posta/id yok)", () => {
    const view = toChildContextView(profile())!;
    const blob = JSON.stringify(view);
    expect(blob).not.toContain("0500");
    expect(blob).not.toContain("0501");
    expect(blob).not.toContain("s1");
    expect(blob).not.toContain("t1");
  });
});

describe("PARENT_QUICK_LINKS (kırık navigasyon kilidi)", () => {
  it("anahtarlar benzersizdir", () => {
    const keys = PARENT_QUICK_LINKS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her hedef app/(parent) altında gerçek route'a çözülür", async () => {
    const missing: string[] = [];
    for (const link of PARENT_QUICK_LINKS) {
      const asFile = path.join(APP_PARENT_DIR, `${link.href}.tsx`);
      const asDir = path.join(APP_PARENT_DIR, link.href);
      const fileExists = await fs
        .access(asFile)
        .then(() => true)
        .catch(() => false);
      const dirExists = await fs
        .access(asDir)
        .then(() => true)
        .catch(() => false);
      if (!fileExists && !dirExists) missing.push(link.href);
    }
    expect(missing, `Kırık hızlı erişim hedefleri: ${missing.join(", ")}`).toEqual([]);
  });

  it("hiçbir hedef teacher/admin operasyonuna gitmez", () => {
    for (const link of PARENT_QUICK_LINKS) {
      expect(link.href).not.toMatch(/teacher|admin|take-attendance|grade|payout|reassign/i);
    }
  });
});

describe("parent route kilitleri (thin-wrapper)", () => {
  it("yoklama route'u ParentAttendanceScreen render eder", async () => {
    const content = await fs.readFile(path.join(APP_PARENT_DIR, "yoklama.tsx"), "utf-8");
    expect(content).toContain("ParentAttendanceScreen");
    expect(content).toContain("features/parent/attendance-screen");
  });

  it("cocugum route'u ParentChildScreen render eder", async () => {
    const content = await fs.readFile(path.join(APP_PARENT_DIR, "cocugum.tsx"), "utf-8");
    expect(content).toContain("ParentChildScreen");
    expect(content).toContain("features/parent/child-screen");
  });
});
