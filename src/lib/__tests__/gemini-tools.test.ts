import { describe, it, expect } from "vitest";
import { buildGeminiToolDescriptors, buildGeminiToolDescriptorsForRole } from "../ai/gemini-tools";

describe("buildGeminiToolDescriptors — kayıtlı olmayan araçları asla fırlatmadan atlar", () => {
  it("collectionsIntake: linkedTools tahsilat/cases.ts fonksiyonlarıdır (agent registry'de yok) — boş liste, hata yok", () => {
    // upsertFollowUpCase / listFollowUpCases agent tool registry'sinde
    // KAYITLI DEĞİL (bkz. capabilities.ts yorumu) — hiçbiri throw etmemeli.
    expect(() => buildGeminiToolDescriptors("collectionsIntake")).not.toThrow();
    const descriptors = buildGeminiToolDescriptors("collectionsIntake");
    expect(descriptors).toEqual([]);
  });

  it("collectionsMessageDraft: sendParentMessage kayıtlı, upsertFollowUpCase değil — yalnız kayıtlı olan döner", () => {
    const descriptors = buildGeminiToolDescriptors("collectionsMessageDraft");
    expect(descriptors.map((d) => d.name)).toEqual(["sendParentMessage"]);
  });

  it("attendanceDailySummary: her iki linkedTool da agent registry'de kayıtlı", () => {
    const descriptors = buildGeminiToolDescriptors("attendanceDailySummary");
    expect(descriptors.map((d) => d.name).sort()).toEqual(
      ["getStudentSchedule", "getTeacherSchedule"].sort()
    );
    for (const d of descriptors) {
      expect(d.description.length).toBeGreaterThan(0);
      expect(Array.isArray(d.requiredRoles)).toBe(true);
    }
  });

  it("bilinmeyen bir capability id'si için boş liste döner, fırlatmaz", () => {
    expect(() => buildGeminiToolDescriptors("notReal" as never)).not.toThrow();
    expect(buildGeminiToolDescriptors("notReal" as never)).toEqual([]);
  });
});

describe("buildGeminiToolDescriptorsForRole — rol filtresi", () => {
  it("STUDENT rolü (veli/öğrenci) yalnızca kendi kapsamındaki aracı görür (getStudentSchedule: ALL, getTeacherSchedule: STAFF)", () => {
    const descriptors = buildGeminiToolDescriptorsForRole("attendanceDailySummary", "STUDENT");
    expect(descriptors.map((d) => d.name)).toEqual(["getStudentSchedule"]);
  });

  it("SUPER_ADMIN her zaman tüm kayıtlı araçları görür", () => {
    const descriptors = buildGeminiToolDescriptorsForRole("attendanceDailySummary", "SUPER_ADMIN");
    expect(descriptors.length).toBe(2);
  });
});
