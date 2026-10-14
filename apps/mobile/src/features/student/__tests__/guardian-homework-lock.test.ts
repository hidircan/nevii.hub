import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveMobilePersona } from "../../../auth/role-to-persona";

/**
 * Guardian ödev contract testleri — CANONICAL (Claude P0 core sonrası).
 *
 * `src/features/student-scope/homework-screen.tsx` ortak dosyadır (Claude
 * sahipliği); bu test dosyayı DEĞİŞTİRMEZ, yalnız mevcut canonical
 * davranışı kilitler:
 * - STUDENT + SELF → `personaOf(user) === "student"` → Teslim Et CTA.
 * - STUDENT + GUARDIAN → `personaOf(user) === "parent"` → salt-görünüm.
 * - Legacy `user.role === "PARENT"` kontrolü YOK (canonical testle de yasak).
 */

const HOMEWORK_SCREEN = path.join(__dirname, "../../student-scope/homework-screen.tsx");

describe("guardian homework contract (canonical)", () => {
  it("teslim kapısı personaOf(user) === \"student\" ile kurulur", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).toContain('personaOf(user) === "student"');
    expect(content).toContain("hwList.submitButton");
  });

  it("guardian dalı personaOf(user) === \"parent\" ile salt-görünümdür", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).toContain('personaOf(user) === "parent"');
    expect(content).toContain("hwList.guardianBlock");
  });

  it("legacy PARENT role kontrolü yoktur", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).not.toMatch(/\.role\s*===\s*"PARENT"/);
  });

  it("ödev ekranında dosya yükleme akışı yoktur (fake upload yok)", async () => {
    const content = await fs.readFile(HOMEWORK_SCREEN, "utf-8");
    expect(content).not.toMatch(/DocumentPicker|launchImageLibrary|upload-homework/i);
  });
});

describe("canonical persona matrix (ödev kapısı kararları)", () => {
  it("STUDENT + SELF → student (action görebilir)", () => {
    expect(resolveMobilePersona({ role: "STUDENT", loginRole: "STUDENT", portalAccessType: "SELF" })).toEqual({
      kind: "persona",
      persona: "student",
    });
  });

  it("STUDENT + GUARDIAN → parent (read-only)", () => {
    expect(resolveMobilePersona({ role: "STUDENT", loginRole: "STUDENT", portalAccessType: "GUARDIAN" })).toEqual({
      kind: "persona",
      persona: "parent",
    });
  });

  it("STUDENT erişim kaydı yoksa unsupported (student action göremez)", () => {
    const res = resolveMobilePersona({ role: "STUDENT", loginRole: "STUDENT", portalAccessType: null });
    expect(res.kind).toBe("unsupported");
  });

  it("legacy PARENT rolü happy-path değildir (fail-closed)", () => {
    const res = resolveMobilePersona({ role: "PARENT", portalAccessType: "GUARDIAN" });
    expect(res.kind).toBe("unsupported");
  });

  it("unknown/unsupported rol student action göremez", () => {
    expect(resolveMobilePersona({ role: "AI_AGENT" }).kind).toBe("unsupported");
    expect(resolveMobilePersona({ role: "HYPER_ADMIN", loginRole: "HYPER_ADMIN" }).kind).toBe("unsupported");
  });
});
