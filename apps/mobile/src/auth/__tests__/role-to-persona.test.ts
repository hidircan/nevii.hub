import { describe, it, expect } from "vitest";
import { roleToPersona } from "../role-to-persona";

describe("roleToPersona", () => {
  it("SUPER_ADMIN ve SCHOOL_ADMIN admin persona'sına gider", () => {
    expect(roleToPersona("SUPER_ADMIN")).toBe("admin");
    expect(roleToPersona("SCHOOL_ADMIN")).toBe("admin");
  });

  it("TEACHER teacher persona'sına gider", () => {
    expect(roleToPersona("TEACHER")).toBe("teacher");
  });

  it("STUDENT ayrı student persona'sına gider (PARENT ile aynı ekranı paylaşmaz)", () => {
    expect(roleToPersona("STUDENT")).toBe("student");
  });

  it("PARENT parent persona'sına gider", () => {
    expect(roleToPersona("PARENT")).toBe("parent");
  });

  it("bilinmeyen/AI_AGENT gibi roller güvenli varsayılan olarak parent'a düşer", () => {
    expect(roleToPersona("AI_AGENT")).toBe("parent");
  });
});
