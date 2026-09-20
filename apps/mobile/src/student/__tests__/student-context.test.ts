/**
 * Çoklu-çocuk veli bağlam sözleşmesi — saf seçim mantığı + statik route kilitleri.
 *
 * Kök neden: mobil bugün tek `studentId` varsayar; veliye tanımlı TÜM aktif
 * erişimler desteklenmelidir (UI limiti YOK). Yetki her istekte sunucudadır
 * (`canAccessStudent`/`assertStudentAccess`); istemci ID üretmez, URL
 * parametresini otorite saymaz.
 */
import { describe, expect, it } from "vitest";
import { availableChildIds, needsChildPicker, validatePersistedSelection } from "../selection";
import type { AuthUser } from "../../auth/auth-context";

function guardian(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: "u1",
    role: "STUDENT",
    loginRole: "STUDENT",
    tenantId: "t1",
    studentId: "s1",
    portalAccessType: "GUARDIAN",
    email: "veli@kurum.com",
    resolution: { kind: "persona", persona: "parent" },
    ...overrides,
  } as AuthUser;
}

describe("availableChildIds — yalnız sunucu oturumu otoritedir", () => {
  it("SELF öğrenci doğrudan kendi kaydına gider (switcher/picker yok)", () => {
    const self = guardian({ portalAccessType: "SELF", studentId: "s9", children: undefined });
    expect(availableChildIds(self)).toEqual(["s9"]);
    expect(needsChildPicker(self)).toBe(false);
  });

  it("tek çocuklu veli doğrudan gider (liste tekil fallback)", () => {
    expect(availableChildIds(guardian())).toEqual(["s1"]);
    expect(needsChildPicker(guardian())).toBe(false);
  });

  it("çok çocuklu veli: sunucu listesi aynen, tekrarsız (limit YOK — 5 çocuk)", () => {
    const u = guardian({
      children: [{ studentId: "s1" }, { studentId: "s2" }, { studentId: "s3" }, { studentId: "s4" }, { studentId: "s5" }],
    });
    expect(availableChildIds(u)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(needsChildPicker(u)).toBe(true);
  });

  it("boş/geçersiz sunucu girdileri elenir, tekil fallback'e düşülmez (liste öncelikli)", () => {
    const u = guardian({ children: [{ studentId: "" }, { studentId: "s2" }, { studentId: "s2" }] });
    expect(availableChildIds(u)).toEqual(["s2"]);
  });

  it("oturumsuz kullanıcıda liste boştur", () => {
    expect(availableChildIds(null)).toEqual([]);
    expect(needsChildPicker(null)).toBe(false);
  });
});

describe("validatePersistedSelection — erişimden çıkarılan çocuk seçilemez", () => {
  it("listedeki tercih korunur", () => {
    expect(validatePersistedSelection(["s1", "s2"], "s2")).toBe("s2");
  });

  it("listede olmayan (iptal edilmiş) tercih geçersiz sayılır", () => {
    expect(validatePersistedSelection(["s1"], "s2")).toBeNull();
    expect(validatePersistedSelection(["s1"], null)).toBeNull();
  });
});

describe("çoklu-çocuk route sözleşmesi (statik)", () => {
  it("index: çoklu veli + seçim yoksa /select-child'a gider; SELF/tek çocuk doğrudan eve", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "..", "..", "app", "index.tsx"), "utf-8");
    expect(content).toMatch(/\/select-child/);
    expect(content).toMatch(/selection\.ready/);
    expect(content).toMatch(/selection\.selectedId/);
  });

  it("select-child route'u kayıtlı ve StudentProvider kökte sarılı", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const layout = await fs.readFile(path.join(__dirname, "..", "..", "..", "app", "_layout.tsx"), "utf-8");
    expect(layout).toMatch(/name="select-child"/);
    expect(layout).toMatch(/StudentProvider/);
  });

  it("picker'da hardcoded öğrenci ID'si yok; seçim listeye karşı doğrulanır", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const picker = await fs.readFile(path.join(__dirname, "..", "..", "..", "app", "select-child.tsx"), "utf-8");
    expect(picker).not.toMatch(/\/api\/v1\/students\/[a-zA-Z0-9_-]{4,}(?![${/])/);
    expect(picker).toMatch(/FlatList/);
    const ctx = await fs.readFile(path.join(__dirname, "..", "student-context.tsx"), "utf-8");
    expect(ctx).toMatch(/childIds\.includes\(studentId\)/);
    expect(ctx).toMatch(/validatePersistedSelection/);
  });

  it("switcher tek çocukta/SELF'te render edilmez (statik)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const content = await fs.readFile(path.join(__dirname, "..", "child-switcher.tsx"), "utf-8");
    expect(content).toMatch(/if \(!ready \|\| !isMulti\) return null/);
  });
});
