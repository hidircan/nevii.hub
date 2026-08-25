import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { listAnnouncementRecipientsTool, createAnnouncementTool, listAnnouncementsForUserTool } from "../services/tools";
import { STUDENT_PORTAL_ACCESS_FILE, inviteStudentPortalAccess, activateStudentPortalAccess } from "../student-portal-access";
import { ANNOUNCEMENTS_FILE, ANNOUNCEMENT_READS_FILE, clearAnnouncements } from "../announcements";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Duyurular artık yalnız şahsa özel (seçili kullanıcı) gönderilebilir —
 * `listAnnouncementRecipientsTool` bu ekranın gerçek alıcı adaylarını
 * (aktif öğretmenler + portal erişimi olan veli/öğrenciler) döner ve
 * `createAnnouncementTool`'daki "selected" hedef kitlesi yalnız o
 * kullanıcılara teslim edilir — role/privacy filtrelemesi burada test edilir.
 */
function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(ANNOUNCEMENTS_FILE, { force: true });
  await fs.rm(ANNOUNCEMENT_READS_FILE, { force: true });
  await clearAnnouncements(DEFAULT_TENANT_ID);
});

describe("listAnnouncementRecipientsTool — RBAC", () => {
  it("TEACHER alıcı listesini göremez (FORBIDDEN)", async () => {
    const res = await listAnnouncementRecipientsTool(adminCtx({ role: "TEACHER", teacherId: "t1" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT alıcı listesini göremez (FORBIDDEN)", async () => {
    const res = await listAnnouncementRecipientsTool(adminCtx({ role: "STUDENT", studentId: "s1" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("listAnnouncementRecipientsTool — içerik", () => {
  it("aktif öğretmen adayı olarak listelenir (t1 — demo bootstrap girişi var)", async () => {
    const res = await listAnnouncementRecipientsTool(adminCtx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const teacher = res.data.recipients.find((r) => r.userId === "user_teacher_t1");
    expect(teacher).toBeDefined();
    expect(teacher?.role).toBe("Öğretmen");
  });

  it("portal erişimi olmayan bir kullanıcı listede yer almaz (privacy)", async () => {
    const res = await listAnnouncementRecipientsTool(adminCtx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.recipients.find((r) => r.userId === "no-such-user")).toBeUndefined();
  });

  it("SELF portal erişimi olan öğrenci 'Öğrenci' rolüyle, GUARDIAN ise 'Veli' rolüyle listelenir", async () => {
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_student_s1_self",
      studentId: "s1",
      accessType: "SELF",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "user_student_s1_self", "s1");
    await inviteStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_guardian_s1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "admin1",
    });
    await activateStudentPortalAccess(DEFAULT_TENANT_ID, "user_guardian_s1", "s1");

    const res = await listAnnouncementRecipientsTool(adminCtx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const self = res.data.recipients.find((r) => r.userId === "user_student_s1_self");
    const guardian = res.data.recipients.find((r) => r.userId === "user_guardian_s1");
    expect(self?.role).toBe("Öğrenci");
    expect(guardian?.role).toBe("Veli");
  });
});

describe("createAnnouncementTool — 'selected' hedef kitle yalnız seçilen kullanıcıya teslim edilir", () => {
  it("seçilmeyen bir kullanıcı duyuruyu görmez, seçilen kullanıcı görür", async () => {
    const created = await createAnnouncementTool(adminCtx(), {
      title: "Şahsa özel duyuru",
      body: "Yalnız sana",
      audienceType: "selected",
      audienceRef: { userIds: ["user_teacher_t1"] },
      status: "published",
    });
    expect(created.ok).toBe(true);

    const forTeacherT1 = await listAnnouncementsForUserTool({
      role: "TEACHER",
      userId: "user_teacher_t1",
      teacherId: "t1",
      tenantId: DEFAULT_TENANT_ID,
      channel: "web",
    });
    expect(forTeacherT1.ok).toBe(true);
    if (forTeacherT1.ok) {
      expect(forTeacherT1.data.announcements.some((a) => a.title === "Şahsa özel duyuru")).toBe(true);
    }

    const forOtherTeacher = await listAnnouncementsForUserTool({
      role: "TEACHER",
      userId: "user_teacher_t2",
      teacherId: "t2",
      tenantId: DEFAULT_TENANT_ID,
      channel: "web",
    });
    expect(forOtherTeacher.ok).toBe(true);
    if (forOtherTeacher.ok) {
      expect(forOtherTeacher.data.announcements.some((a) => a.title === "Şahsa özel duyuru")).toBe(false);
    }
  });
});
