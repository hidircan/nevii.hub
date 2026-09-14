/**
 * Mobil UAT — portal erişim/persona regresyonları + davet e-postası "linki kopyala" fallback'i.
 * Persona kaynağı `resolveActivePortalAccess` (GET /api/v1/mobile/session); yetki kaynağı
 * `canAccessStudent`. Aktif User + aktif Student TEK BAŞINA erişim vermez.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { canAccessStudent, type ServiceContext } from "../services/context";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  inviteStudentPortalAccess,
  activateStudentPortalAccess,
  revokeStudentPortalAccess,
  resolveActivePortalAccess,
  listAccessForStudent,
  type PortalAccessType,
} from "../student-portal-access";
import { inviteStudentPortalAccessTool } from "../services/tools";
import { setEmailTransportForTests, type EmailSendResult } from "../email";
import { getUserIdByEmail } from "../auth/users";

const T = DEFAULT_TENANT_ID;
const studentCtx = (userId: string): ServiceContext => ({ role: "STUDENT", userId, tenantId: T, channel: "web" });
const adminCtx: ServiceContext = { role: "SCHOOL_ADMIN", userId: "admin_uat_test", tenantId: T, channel: "web" };

async function grant(userId: string, studentId: string, accessType: PortalAccessType) {
  await inviteStudentPortalAccess({ tenantId: T, userId, studentId, accessType, invitedBy: "test" });
  await activateStudentPortalAccess(T, userId, studentId);
}

function mockTransport(result: EmailSendResult) {
  setEmailTransportForTests({ name: "mock", send: async () => result });
}

const uniqueEmail = (tag: string) => `uat-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});
afterEach(() => setEmailTransportForTests(null));

describe("mobil persona/erişim çözümü", () => {
  it("1. aktif erişim kaydı yoksa reddedilir", async () => {
    expect(await resolveActivePortalAccess(T, "uat_no_access", "s2")).toBeNull();
    expect(await canAccessStudent(studentCtx("uat_no_access"), "s2")).toBe(false);
  });

  it("2. aktif SELF → öğrenci persona (kendi öğrencisi)", async () => {
    await grant("uat_self", "s2", "SELF");
    expect(await resolveActivePortalAccess(T, "uat_self", "s2")).toEqual({ studentId: "s2", accessType: "SELF" });
  });

  it("3. aktif GUARDIAN → veli persona; JWT studentId olmadan da öğrenci çözülür", async () => {
    await grant("uat_guardian", "s2", "GUARDIAN");
    expect(await resolveActivePortalAccess(T, "uat_guardian")).toEqual({ studentId: "s2", accessType: "GUARDIAN" });
  });

  it("4. veli bağlı olmadığı öğrenciye erişemez", async () => {
    await grant("uat_guardian", "s2", "GUARDIAN");
    expect(await canAccessStudent(studentCtx("uat_guardian"), "s2")).toBe(true);
    expect(await canAccessStudent(studentCtx("uat_guardian"), "s3")).toBe(false);
  });

  it("5. invited erişim active gibi davranmaz", async () => {
    await inviteStudentPortalAccess({ tenantId: T, userId: "uat_inv", studentId: "s2", accessType: "SELF", invitedBy: "test" });
    expect(await resolveActivePortalAccess(T, "uat_inv", "s2")).toBeNull();
    expect(await canAccessStudent(studentCtx("uat_inv"), "s2")).toBe(false);
  });

  it("6. revoked erişim reddedilir", async () => {
    await grant("uat_rev", "s2", "GUARDIAN");
    await revokeStudentPortalAccess(T, "uat_rev", "s2");
    expect(await resolveActivePortalAccess(T, "uat_rev")).toBeNull();
    expect(await canAccessStudent(studentCtx("uat_rev"), "s2")).toBe(false);
  });

  it("birden fazla kayıt: JWT öğrencisi aktifse o, değilse yalnız aktif olan seçilir", async () => {
    await grant("uat_multi", "s2", "GUARDIAN");
    await grant("uat_multi", "s3", "GUARDIAN");
    await inviteStudentPortalAccess({ tenantId: T, userId: "uat_multi", studentId: "s4", accessType: "SELF", invitedBy: "test" });
    expect((await resolveActivePortalAccess(T, "uat_multi", "s3"))?.studentId).toBe("s3");
    // Tercih edilen kayıt yalnız invited → aktif kayıtlardan biri seçilir, invited ASLA.
    expect(["s2", "s3"]).toContain((await resolveActivePortalAccess(T, "uat_multi", "s4"))?.studentId);
  });
});

describe("portal daveti — idempotency ve e-posta fallback'i", () => {
  it("7. aynı kişiye tekrar davet idempotent: tek kayıt, invited kalır", async () => {
    mockTransport({ delivered: true });
    const email = uniqueEmail("dup");
    for (let i = 0; i < 2; i++) {
      const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s2", email, accessType: "GUARDIAN" });
      expect(r.ok).toBe(true);
    }
    const userId = await getUserIdByEmail(T, email);
    const rows = (await listAccessForStudent(T, "s2")).filter((r) => r.userId === userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("invited");
    expect(await resolveActivePortalAccess(T, userId!)).toBeNull();
  });

  it.each(["SELF", "GUARDIAN"] as const)("%s: gönderim başarısızsa admin'e davet linki döner, başarı gösterilmez", async (accessType) => {
    mockTransport({ delivered: false, blocked: false, reason: "SMTP_SEND_FAILED" });
    const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s2", email: uniqueEmail(accessType), accessType });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.delivered).toBe(false);
    expect(r.data.activationLink).toMatch(/\/hesap-aktivasyon\?token=/);
  });

  it("gönderim başarılıysa link DÖNMEZ", async () => {
    mockTransport({ delivered: true });
    const r = await inviteStudentPortalAccessTool(adminCtx, { studentId: "s2", email: uniqueEmail("ok"), accessType: "SELF" });
    expect(r.ok && r.data.activationLink).toBeFalsy();
  });

  it("yönetici olmayan davet (ve link) alamaz", async () => {
    mockTransport({ delivered: false, blocked: true, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" });
    const r = await inviteStudentPortalAccessTool(studentCtx("uat_self"), {
      studentId: "s2",
      email: uniqueEmail("nope"),
      accessType: "SELF",
    });
    expect(r.ok).toBe(false);
  });
});
