import { describe, it, expect } from "vitest";
import { resolveMobilePersona, unsupportedCopy, UNSUPPORTED_COPY } from "../role-to-persona";

const persona = (p: string) => ({ kind: "persona", persona: p });
const unsupported = (reason: string) => ({ kind: "unsupported", reason });

describe("resolveMobilePersona — sunucu oturum gerçeklerinden persona", () => {
  it("SUPER_ADMIN ve SCHOOL_ADMIN mevcut admin persona'sına gider", () => {
    expect(resolveMobilePersona({ role: "SUPER_ADMIN", loginRole: "SUPER_ADMIN" })).toEqual(persona("admin"));
    expect(resolveMobilePersona({ role: "SCHOOL_ADMIN", loginRole: "SCHOOL_ADMIN" })).toEqual(persona("admin"));
  });

  it("TEACHER öğretmen persona'sına gider", () => {
    expect(resolveMobilePersona({ role: "TEACHER", loginRole: "TEACHER" })).toEqual(persona("teacher"));
  });

  it("HYPER_ADMIN fail-closed: platform web'e yönlendirilir, mobil portal açılmaz", () => {
    expect(resolveMobilePersona({ role: "HYPER_ADMIN", loginRole: "HYPER_ADMIN" })).toEqual(unsupported("platform_web"));
  });

  it("BRANCH_MANAGER unified (efektif SCHOOL_ADMIN) admin portalına AÇILMAZ", () => {
    expect(resolveMobilePersona({ role: "SCHOOL_ADMIN", loginRole: "BRANCH_MANAGER" })).toEqual(unsupported("manager_web"));
  });

  it("BRANCH_MANAGER branch_scoped fail-closed", () => {
    expect(resolveMobilePersona({ role: "BRANCH_MANAGER", loginRole: "BRANCH_MANAGER" })).toEqual(unsupported("manager_web"));
  });

  it("STUDENT + SELF → öğrenci, STUDENT + GUARDIAN → veli (sessizce birleştirilmez)", () => {
    expect(resolveMobilePersona({ role: "STUDENT", loginRole: "STUDENT", portalAccessType: "SELF" })).toEqual(persona("student"));
    expect(resolveMobilePersona({ role: "STUDENT", loginRole: "STUDENT", portalAccessType: "GUARDIAN" })).toEqual(persona("parent"));
  });

  it("STUDENT aktif portal erişimi yoksa fail-closed", () => {
    expect(resolveMobilePersona({ role: "STUDENT", loginRole: "STUDENT", portalAccessType: null })).toEqual(unsupported("no_portal_access"));
    expect(resolveMobilePersona({ role: "STUDENT" })).toEqual(unsupported("no_portal_access"));
  });

  it("AI_AGENT ve bilinmeyen roller fail-closed (asla parent'a düşmez)", () => {
    expect(resolveMobilePersona({ role: "AI_AGENT", loginRole: "AI_AGENT" })).toEqual(unsupported("no_mobile_persona"));
    expect(resolveMobilePersona({ role: "SOMETHING_NEW" })).toEqual(unsupported("no_mobile_persona"));
    expect(resolveMobilePersona({ role: "" })).toEqual(unsupported("no_mobile_persona"));
  });

  it("PARENT login rolü yok: gelirse bilinmeyen rol gibi fail-closed (veli yalnız STUDENT+GUARDIAN)", () => {
    expect(resolveMobilePersona({ role: "PARENT" })).toEqual(unsupported("no_mobile_persona"));
    expect(resolveMobilePersona({ role: "PARENT", portalAccessType: "GUARDIAN" })).toEqual(unsupported("no_mobile_persona"));
  });

  it("canonical mobil kodda legacy `role === \"PARENT\"` kontrolü yok", async () => {
    const { promises: fs } = await import("fs");
    const path = await import("path");
    const root = path.join(__dirname, "../../..");
    const offenders: string[] = [];
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== "__tests__") await walk(full);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = await fs.readFile(full, "utf8");
          if (/\.role\s*===\s*"PARENT"|"PARENT"\s*===\s*\w+\.role|\|\s*"PARENT"/.test(src)) offenders.push(path.relative(root, full));
        }
      }
    }
    await walk(path.join(root, "app"));
    await walk(path.join(root, "src"));
    expect(offenders).toEqual([]);
  });

  it("loginRole eksikse efektif rol kullanılır", () => {
    expect(resolveMobilePersona({ role: "TEACHER" })).toEqual(persona("teacher"));
  });

  it("her desteklenmeyen neden için Türkçe metin ve web yolu tanımlı", () => {
    const tr = (p: string) => p;
    for (const reason of Object.keys(UNSUPPORTED_COPY) as Array<keyof typeof UNSUPPORTED_COPY>) {
      const copy = unsupportedCopy(reason, tr);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.webPath.startsWith("/")).toBe(true);
    }
  });
});
