import { describe, it, expect } from "vitest";
import {
  MEB_LEVEL_OPTIONS,
  studentLevelRequired,
  studentLevelVisible,
  validateStudentLevel,
} from "../student-level-rules";

describe("student level rules (PRODUCT_BACKLOG §1.1)", () => {
  it("MEB: seviye görünür ve zorunlu 1–8", () => {
    expect(studentLevelVisible(["MEB"])).toBe(true);
    expect(studentLevelRequired(["MEB"])).toBe(true);
    expect(validateStudentLevel(["MEB"], undefined)).toMatch(/zorunlu/);
    expect(validateStudentLevel(["MEB"], "9")).toMatch(/zorunlu|1–8/);
    expect(validateStudentLevel(["MEB"], "5")).toBeNull();
    expect(MEB_LEVEL_OPTIONS).toHaveLength(8);
  });

  it("LCM: seviye görünür opsiyonel", () => {
    expect(studentLevelVisible(["London College of Music Hazırlık"])).toBe(true);
    expect(studentLevelRequired(["London College of Music Hazırlık"])).toBe(false);
    expect(validateStudentLevel(["London College of Music Hazırlık"], undefined)).toBeNull();
    expect(validateStudentLevel(["London College of Music Hazırlık"], "Grade 2")).toBeNull();
  });

  it("Hobi/diğer: seviye görünmez; dolu seviye hata", () => {
    expect(studentLevelVisible(["Hobi"])).toBe(false);
    expect(validateStudentLevel(["Hobi"], "3")).toMatch(/kullanılmaz/);
    expect(validateStudentLevel(["Hobi"], undefined)).toBeNull();
  });

  it("Faz 1B — MEB + LCM birlikte atanmışsa MEB'in katı kuralı (seviye zorunlu 1–8) kazanır", () => {
    expect(studentLevelVisible(["London College of Music Hazırlık", "MEB"])).toBe(true);
    expect(studentLevelRequired(["London College of Music Hazırlık", "MEB"])).toBe(true);
    expect(validateStudentLevel(["London College of Music Hazırlık", "MEB"], undefined)).toMatch(/zorunlu/);
    expect(validateStudentLevel(["London College of Music Hazırlık", "MEB"], "5")).toBeNull();
  });

  it("hiç tür atanmamışsa (boş dizi) seviye görünmez/gerekmez", () => {
    expect(studentLevelVisible([])).toBe(false);
    expect(studentLevelRequired([])).toBe(false);
    expect(validateStudentLevel([], undefined)).toBeNull();
  });
});
