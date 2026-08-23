import { describe, it, expect } from "vitest";
import { APP_ROLES } from "../auth/types";
import { assertPermission, hasPermission } from "../auth/rbac";

describe("RBAC", () => {
  it("SUPER_ADMIN tüm izinlere sahiptir", () => {
    expect(hasPermission("SUPER_ADMIN", "payments:write")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "tenant:all")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "demo:reset")).toBe(true);
  });

  it("STUDENT (Karma Öğrenci Portalı — veli/öğrenci) yazma izinlerine sahip değildir", () => {
    expect(hasPermission("STUDENT", "payments:write")).toBe(false);
    expect(hasPermission("STUDENT", "attendance:write")).toBe(false);
    expect(hasPermission("STUDENT", "students:write")).toBe(false);
  });

  it("STUDENT okuma izinlerine sahiptir", () => {
    expect(hasPermission("STUDENT", "students:read")).toBe(true);
  });

  it("her rol tanımlı bir rol tipidir", () => {
    for (const role of APP_ROLES) {
      expect(role).toBeTypeOf("string");
      expect(role.length).toBeGreaterThan(0);
    }
  });

  it("bilinmeyen rol hiçbir izne sahip değildir", () => {
    expect(
      hasPermission("ANONYMOUS" as (typeof APP_ROLES)[number], "students:read")
    ).toBe(false);
  });

  it("assertPermission yetkili rol için ok döner", () => {
    const res = assertPermission("SCHOOL_ADMIN", "makeup:write");
    expect(res).toEqual({ ok: true });
  });

  it("assertPermission yetkisiz rol için message döner", () => {
    const res = assertPermission("TEACHER", "payments:write");
    expect(res).toEqual({
      ok: false,
      message: "Role TEACHER lacks permission payments:write",
    });
  });
});
