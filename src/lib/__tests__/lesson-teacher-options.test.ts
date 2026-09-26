import { describe, it, expect } from "vitest";
import { defaultLessonTeacherId, lessonTeacherOptions } from "../lesson-teacher-options";
import { activeTeachersForBranch, resolveTeacherFilterForBranch } from "@/components/program-studio";
import type { Teacher } from "../types";

/**
 * Sentetik — test DB'de doğrulanan vakanın BİÇİMİ (kişisel veri yok):
 * öğrenci "evka3"te, atanmış öğretmen yalnız "erzene"ye atanmış; şubede aynı
 * enstrümanı veren iki başka öğretmen var. Eski seçici atanmış öğretmeni
 * gizleyip yalnız diğer ikisini gösteriyordu.
 */
const t = (id: string, name: string, branchId: string, instruments: string[], extra: Partial<Teacher> = {}): Teacher =>
  ({ id, name, branchId, instruments, availability: [], maxDailyLessons: 8, active: true, ...extra }) as unknown as Teacher;

const assigned = t("tA", "Atanmış Öğretmen", "erzene", ["Piyano"]);
const other1 = t("tB", "Bora", "evka3", ["Piyano"]);
const other2 = t("tC", "Cem", "evka3", ["Piyano"]);
const teachers = [other2, assigned, other1];
const student = { teacherId: "tA", branchId: "evka3" };

describe("ders planlama öğretmen seçici", () => {
  it("atanmış öğretmen şubede ders vermiyorsa GİZLENMEZ; uygun değil + nedeniyle görünür, sessizce başkası seçilmez", () => {
    const opts = lessonTeacherOptions(teachers, { instrument: "Piyano", branchId: "evka3", branchName: "Evka 3", student });
    expect(opts[0]).toMatchObject({ id: "tA", isAssigned: true, eligible: false });
    expect(opts[0]!.reason).toMatch(/Evka 3 şubesinde ders vermiyor/);
    expect(opts.slice(1).map((o) => o.id)).toEqual(["tB", "tC"]);
    expect(defaultLessonTeacherId(opts)).toBe("");
  });

  it("öğretmene ek şube (branchIds) atanınca uygun olur ve varsayılan öneri odur", () => {
    const fixed = [other2, { ...assigned, branchIds: ["evka3"] } as Teacher, other1];
    const opts = lessonTeacherOptions(fixed, { instrument: "Piyano", branchId: "evka3", student });
    expect(opts[0]).toMatchObject({ id: "tA", eligible: true });
    expect(defaultLessonTeacherId(opts)).toBe("tA");
  });

  it("enstrüman uymuyor veya pasifse neden söylenir; atanmamış uygunsuzlar listelenmez", () => {
    const opts = lessonTeacherOptions(
      [{ ...assigned, branchId: "evka3", instruments: ["Gitar"] } as Teacher, t("tD", "Pasif", "evka3", ["Piyano"], { active: false }), other1],
      { instrument: "Piyano", branchId: "evka3", student }
    );
    expect(opts.map((o) => o.id)).toEqual(["tA", "tB"]);
    expect(opts[0]!.reason).toMatch(/Piyano dersi vermiyor/);
  });

  it("takvim şube filtresi ek şubeyi de sayar", () => {
    const multi = { ...assigned, branchIds: ["evka3"] } as Teacher;
    expect(activeTeachersForBranch([multi, other1], "evka3").map((x) => x.id)).toContain("tA");
    expect(resolveTeacherFilterForBranch([multi], "evka3", "tA")).toBe("tA");
    expect(resolveTeacherFilterForBranch([assigned], "evka3", "tA")).toBe("");
  });
});
