import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { hasPermission } from "../auth/rbac";
import { canAccessStudent, canAccessTeacher, isStaff } from "../services/context";
import {
  getStudentScheduleTool,
  listAssessmentsForStudentTool,
  markAttendanceTool,
  createPaymentTool,
  createStudentTool,
  createAssessmentTool,
} from "../services/tools";
import {
  createNotification,
  listNotificationsForUser,
  clearNotifications,
  NOTIFICATIONS_FILE,
} from "../notifications";
import { listAnnouncementsForUserTool, createAnnouncementTool } from "../services/tools";
import { clearAnnouncements, ANNOUNCEMENTS_FILE, ANNOUNCEMENT_READS_FILE } from "../announcements";
import { LESSON_ASSESSMENTS_FILE, clearAssessments } from "../assessment";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "STUDENT",
    userId: "user_student_s1",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s1",
    channel: "web",
    ...overrides,
  };
}

function adminCtx(): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "admin1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
  };
}

beforeEach(async () => {
  await fs.rm(LESSON_ASSESSMENTS_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(ANNOUNCEMENTS_FILE, { force: true });
  await fs.rm(ANNOUNCEMENT_READS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await clearAssessments(DEFAULT_TENANT_ID);
  await clearNotifications(DEFAULT_TENANT_ID);
  await clearAnnouncements(DEFAULT_TENANT_ID);
});

describe("EPIC 6A — RBAC: STUDENT yalnızca kendi verisini okur, hiçbir şey yazamaz", () => {
  it("STUDENT'ın izin seti yalnızca read yetkileri içerir — write yetkisi yok", () => {
    expect(hasPermission("STUDENT", "students:read")).toBe(true);
    expect(hasPermission("STUDENT", "notifications:read")).toBe(true);
    expect(hasPermission("STUDENT", "announcements:read")).toBe(true);
    expect(hasPermission("STUDENT", "assessments:read")).toBe(true);

    expect(hasPermission("STUDENT", "students:write")).toBe(false);
    // Karma Öğrenci Portalı — eski PARENT rolünün communication:write izni
    // STUDENT'a birleştirildi (veli/öğrenci ayrımı artık rol değil,
    // StudentPortalAccess.accessType). Bkz. src/lib/auth/rbac.ts STUDENT yorumu.
    expect(hasPermission("STUDENT", "communication:write")).toBe(true);
    expect(hasPermission("STUDENT", "announcements:write")).toBe(false);
    expect(hasPermission("STUDENT", "assessments:write")).toBe(false);
    expect(hasPermission("STUDENT", "payments:write")).toBe(false);
    expect(hasPermission("STUDENT", "messages:send")).toBe(false);
    expect(hasPermission("STUDENT", "demo:reset")).toBe(false);
  });

  it("STUDENT staff sayılmaz (isStaff false)", () => {
    expect(isStaff(studentCtx())).toBe(false);
  });

  it("canAccessStudent: yalnızca aktif StudentPortalAccess'i olan öğrenciye true, başka öğrenci için false", async () => {
    await grantStudentAccess(studentCtx(), "s1", "SELF");
    expect(await canAccessStudent(studentCtx(), "s1")).toBe(true);
    expect(await canAccessStudent(studentCtx(), "s2")).toBe(false);
  });

  it("canAccessTeacher: STUDENT hiçbir öğretmene 'sahip' değildir (false)", () => {
    expect(canAccessTeacher(studentCtx(), "t1")).toBe(false);
  });

  it("getStudentScheduleTool: STUDENT kendi programını görebilir", async () => {
    await grantStudentAccess(studentCtx(), "s1", "SELF");
    const result = await getStudentScheduleTool(studentCtx(), { studentId: "s1" });
    expect(result.ok).toBe(true);
  });

  it("getStudentScheduleTool: STUDENT başka öğrencinin programını göremez (FORBIDDEN)", async () => {
    const result = await getStudentScheduleTool(studentCtx(), { studentId: "s2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("markAttendanceTool: STUDENT yoklama işaretleyemez (FORBIDDEN)", async () => {
    const result = await markAttendanceTool(studentCtx(), {
      lessonId: "l1",
      status: "present",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("createPaymentTool: STUDENT ödeme işlemi yapamaz (FORBIDDEN)", async () => {
    const result = await createPaymentTool(studentCtx(), { paymentId: "p1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("createStudentTool: STUDENT yeni öğrenci kaydı oluşturamaz (FORBIDDEN)", async () => {
    const result = await createStudentTool(studentCtx(), {
      name: "x",
      phone: "555",
      parentName: "y",
      parentPhone: "555",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("createAnnouncementTool: STUDENT duyuru oluşturamaz (FORBIDDEN)", async () => {
    const result = await createAnnouncementTool(studentCtx(), {
      title: "x",
      body: "y",
      audienceType: "all",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("listAssessmentsForStudentTool: STUDENT kendi değerlendirmesini görebilir, parentPrivateNote parentNoteVisibleToStudent=false iken görünmez", async () => {
    const created = await createAssessmentTool(adminCtx(), {
      lessonId: "l1",
      studentId: "s1",
      teknikBecerisi: 4,
      notaOkuma: 4,
      muzikalite: 4,
      ritimDuyusu: 4,
      calismaDuzeni: 4,
      evOdeviTamamlama: 4,
      dersKatilimi: 4,
      motivasyon: 4,
      genelIlerleme: 4,
      hedefeUlasma: 4,
      strengthNote: "x",
      nextStepsNote: "y",
      improvementNote: "z",
      parentPrivateNote: "veliye özel",
      parentNoteVisibleToStudent: false,
      teacherSignedName: "Öğretmen",
    });
    expect(created.ok).toBe(true);

    await grantStudentAccess(studentCtx(), "s1", "SELF");
    const result = await listAssessmentsForStudentTool(studentCtx(), { studentId: "s1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.assessments).toHaveLength(1);
    expect(result.data.assessments[0].parentPrivateNote).toBeUndefined();
  });

  it("listAssessmentsForStudentTool: STUDENT başka öğrencinin değerlendirmesini göremez (FORBIDDEN)", async () => {
    const result = await listAssessmentsForStudentTool(studentCtx(), { studentId: "s2" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("listNotificationsForUser: STUDENT yalnızca kendi studentId'sine hedeflenen bildirimi görür", async () => {
    await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetStudentId: "s1",
      kind: "info",
      title: "Bana ait",
      body: "x",
    });
    await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetStudentId: "s2",
      kind: "info",
      title: "Başkasına ait",
      body: "x",
    });
    const own = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, studentId: "s1" });
    expect(own.map((n) => n.title)).toEqual(["Bana ait"]);
  });

  it("listAnnouncementsForUserTool: STUDENT 'students' hedefli duyuruyu görür, 'parents' hedeflisini görmez", async () => {
    await createAnnouncementTool(adminCtx(), {
      title: "Öğrencilere",
      body: "x",
      audienceType: "students",
      status: "published",
    });
    await createAnnouncementTool(adminCtx(), {
      title: "Velilere",
      body: "x",
      audienceType: "parents",
      status: "published",
    });
    const result = await listAnnouncementsForUserTool(studentCtx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.announcements.map((a) => a.title)).toEqual(["Öğrencilere"]);
  });
});
