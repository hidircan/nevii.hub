import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  assertStudentAccess,
  canAccessStudent,
  canAccessTeacher,
  requireRole,
} from "../services/context";
import type { ServiceContext } from "../services/context";
import type { AppRole } from "../auth/types";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  inviteStudentPortalAccess,
  revokeStudentPortalAccess,
} from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

/**
 * EPIC 0 + production hardening — rol/yetki matrisi.
 * TEACHER için öğrenci erişimi ownership olmadan fail-closed.
 *
 * Karma Öğrenci Portalı — eski "PARENT" rolü kaldırıldı (bkz.
 * src/lib/auth/types.ts). Veli/öğrenci ayrımı artık STUDENT rolünün
 * YANINDA `StudentPortalAccess.accessType` ("GUARDIAN" | "SELF") ile
 * çözülür ve her istekte async, StudentPortalAccess tablosundan doğrulanır
 * — `ctx.studentId` alanı tek başına ARTIK erişim vermez.
 */

function ctx(overrides: Partial<ServiceContext> & { role: AppRole }): ServiceContext {
  return { userId: "u1", tenantId: "tenant_a", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("canAccessStudent — rol matrisi", () => {
  it("SUPER_ADMIN/SCHOOL_ADMIN/AI_AGENT her öğrenciye erişir", async () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "AI_AGENT"] as const) {
      expect(await canAccessStudent(ctx({ role }), "s1")).toBe(true);
      expect(await canAccessStudent(ctx({ role }), "s_baska_kurum")).toBe(true);
    }
  });

  it("STUDENT (veli, GUARDIAN erişimi) yalnızca KENDİ çocuğuna erişir — başka bir öğrenciye kesinlikle erişemez", async () => {
    const parent = ctx({ role: "STUDENT", studentId: "s1" });
    await grantStudentAccess(parent, "s1", "GUARDIAN");
    expect(await canAccessStudent(parent, "s1")).toBe(true);
    expect(await canAccessStudent(parent, "s2")).toBe(false);
    expect(await canAccessStudent(parent, "s_baska_kurum")).toBe(false);
  });

  it("STUDENT (öğrencinin kendisi, SELF erişimi) kendi kaydına erişir", async () => {
    const self = ctx({ role: "STUDENT", studentId: "s1" });
    await grantStudentAccess(self, "s1", "SELF");
    expect(await canAccessStudent(self, "s1")).toBe(true);
    expect(await canAccessStudent(self, "s2")).toBe(false);
  });

  it("aktif StudentPortalAccess kaydı olmayan STUDENT hiçbir öğrenciye erişemez (ctx.studentId tek başına YETMEZ)", async () => {
    const student = ctx({ role: "STUDENT", studentId: "s1" });
    expect(await canAccessStudent(student, "s1")).toBe(false);
  });

  it("çok-çocuklu veli (multi-child guardian) her iki çocuğuna da erişir, üçüncüsüne erişemez", async () => {
    const parent = ctx({ role: "STUDENT", userId: "guardian1" });
    await grantStudentAccess(parent, "s1", "GUARDIAN");
    await grantStudentAccess(parent, "s2", "GUARDIAN");
    expect(await canAccessStudent(parent, "s1")).toBe(true);
    expect(await canAccessStudent(parent, "s2")).toBe(true);
    expect(await canAccessStudent(parent, "s3")).toBe(false);
  });

  it("iptal edilen (revoked) erişim BİR SONRAKİ istekte hemen etkilidir", async () => {
    const parent = ctx({ role: "STUDENT", userId: "guardian2" });
    await grantStudentAccess(parent, "s1", "GUARDIAN");
    expect(await canAccessStudent(parent, "s1")).toBe(true);

    await revokeStudentPortalAccess(parent.tenantId, parent.userId, "s1");
    expect(await canAccessStudent(parent, "s1")).toBe(false);
  });

  it("status=invited (henüz kabul edilmemiş davet) erişim VERMEZ — yalnızca active", async () => {
    const parent = ctx({ role: "STUDENT", userId: "guardian3" });
    await inviteStudentPortalAccess({
      tenantId: parent.tenantId,
      userId: parent.userId,
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    // BİLİNÇLİ OLARAK activateStudentPortalAccess çağrılmadı.
    expect(await canAccessStudent(parent, "s1")).toBe(false);
  });

  it("tenant izolasyonu — başka tenant'taki aktif erişim bu tenant'ta geçersizdir", async () => {
    const parentTenantA = ctx({ role: "STUDENT", userId: "guardian4", tenantId: "tenant_a" });
    await grantStudentAccess(parentTenantA, "s1", "GUARDIAN");
    expect(await canAccessStudent(parentTenantA, "s1")).toBe(true);

    const sameUserTenantB = ctx({ role: "STUDENT", userId: "guardian4", tenantId: "tenant_b" });
    expect(await canAccessStudent(sameUserTenantB, "s1")).toBe(false);
  });

  it("TEACHER ownership olmadan false (fail-closed IDOR koruması)", async () => {
    expect(await canAccessStudent(ctx({ role: "TEACHER", teacherId: "t2" }), "s1")).toBe(false);
  });

  it("TEACHER yalnızca kendi öğrencisine ownership ile erişir", async () => {
    const teacher = ctx({ role: "TEACHER", teacherId: "t1" });
    expect(await canAccessStudent(teacher, "s1", { teacherId: "t1" })).toBe(true);
    expect(await canAccessStudent(teacher, "s2", { teacherId: "t2" })).toBe(false);
  });

  it("TEACHER teacherId yoksa erişemez", async () => {
    expect(await canAccessStudent(ctx({ role: "TEACHER" }), "s1", { teacherId: "t1" })).toBe(false);
  });
});

describe("assertStudentAccess", () => {
  const s1 = { id: "s1", teacherId: "t1" };

  it("kendi öğretmeni için ok", async () => {
    expect((await assertStudentAccess(ctx({ role: "TEACHER", teacherId: "t1" }), s1, "s1")).ok).toBe(true);
  });

  it("cross-teacher FORBIDDEN", async () => {
    const r = await assertStudentAccess(ctx({ role: "TEACHER", teacherId: "t2" }), s1, "s1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN");
  });

  it("olmayan öğrenci NOT_FOUND (bilgi sızdırmaz — aynı kabuk)", async () => {
    const r = await assertStudentAccess(ctx({ role: "TEACHER", teacherId: "t1" }), undefined, "ghost");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_FOUND");
  });

  it("veli (STUDENT rolü, GUARDIAN erişimi) kendi çocuğuna erişir", async () => {
    const parent = ctx({ role: "STUDENT", studentId: "s1" });
    await grantStudentAccess(parent, "s1", "GUARDIAN");
    expect((await assertStudentAccess(parent, s1, "s1")).ok).toBe(true);
  });

  it("veli (StudentPortalAccess kaydı olmadan) başka çocuğa erişemez", async () => {
    const r = await assertStudentAccess(ctx({ role: "STUDENT", studentId: "s2" }), s1, "s1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN");
  });
});

describe("canAccessTeacher — rol matrisi", () => {
  it("SUPER_ADMIN/SCHOOL_ADMIN/AI_AGENT her öğretmene erişir", () => {
    for (const role of ["SUPER_ADMIN", "SCHOOL_ADMIN", "AI_AGENT"] as const) {
      expect(canAccessTeacher(ctx({ role }), "t2")).toBe(true);
    }
  });

  it("TEACHER yalnızca KENDİ kaydına erişir — başka bir öğretmene kesinlikle erişemez", () => {
    const teacher = ctx({ role: "TEACHER", teacherId: "t2" });
    expect(canAccessTeacher(teacher, "t2")).toBe(true);
    expect(canAccessTeacher(teacher, "t3")).toBe(false);
  });

  it("STUDENT (veli/öğrenci) hiçbir öğretmen kaydına erişemez", () => {
    expect(canAccessTeacher(ctx({ role: "STUDENT", studentId: "s1" }), "t2")).toBe(false);
  });
});

describe("requireRole — SUPER_ADMIN bypass, diğer roller listeye tabi", () => {
  it("SUPER_ADMIN izin listesinde olmasa bile geçer (kasıtlı bypass)", () => {
    expect(requireRole(ctx({ role: "SUPER_ADMIN" }), ["TEACHER"]).ok).toBe(true);
  });

  it("izin listesindeki rol geçer", () => {
    expect(requireRole(ctx({ role: "SCHOOL_ADMIN" }), ["SCHOOL_ADMIN", "SUPER_ADMIN"]).ok).toBe(true);
  });

  it("izin listesinde olmayan rol (SUPER_ADMIN hariç) reddedilir", () => {
    const result = requireRole(ctx({ role: "STUDENT" }), ["SCHOOL_ADMIN", "SUPER_ADMIN"]);
    expect(result.ok).toBe(false);
  });

  it("TEACHER, yalnızca ADMIN grubuna açık bir işlemi (ör. ücret değiştirme) yapamaz", () => {
    expect(requireRole(ctx({ role: "TEACHER" }), ["SCHOOL_ADMIN", "SUPER_ADMIN"]).ok).toBe(false);
  });

  it("STUDENT (veli/öğrenci), yalnızca STAFF grubuna açık bir işlemi (ör. yoklama işaretleme) yapamaz", () => {
    expect(
      requireRole(ctx({ role: "STUDENT" }), ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "AI_AGENT"]).ok
    ).toBe(false);
  });
});
