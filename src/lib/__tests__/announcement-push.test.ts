import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createAnnouncementTool,
  updateAnnouncementStatusTool,
  listNotificationsTool,
} from "../services/tools";
import { readData } from "../store";
import { ANNOUNCEMENTS_FILE, ANNOUNCEMENT_READS_FILE, clearAnnouncements } from "../announcements";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { NOTIFICATIONS_FILE } from "../notifications";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { grantStudentAccess } from "./portal-access-test-helper";

function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "admin1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}
function teacherCtx(teacherId: string, userId: string): ServiceContext {
  return { role: "TEACHER", userId, tenantId: DEFAULT_TENANT_ID, teacherId, channel: "web" };
}

beforeEach(async () => {
  await fs.rm(ANNOUNCEMENTS_FILE, { force: true });
  await fs.rm(ANNOUNCEMENT_READS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await clearAnnouncements(DEFAULT_TENANT_ID);
});

/** t1 = "Turgay Hoşbaş" (seed.ts), Piyano/Gitar/Elektro Gitar/Şan/Yan Flüt çalar, user_teacher_t1 hesabına bağlı. */
const T1_TEACHER_ID = "t1";
const T1_USER_ID = "user_teacher_t1";

describe("Faz 4 — PUSH: yayınlanma anında hedef kitleye Notification materyalizasyonu", () => {
  it("instrument segmenti: enstrümanı çalan öğretmen yayınlanınca TEK bildirim alır, recipientCount doğru", async () => {
    const created = await createAnnouncementTool(adminCtx(), {
      title: "Piyano atölyesi",
      body: "Bu hafta sonu piyano atölyesi var.",
      audienceType: "instrument",
      audienceRef: { instrument: ["Piyano"] },
      status: "published",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listNotificationsTool(teacherCtx(T1_TEACHER_ID, T1_USER_ID));
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const own = list.data.notifications.filter((n) => n.kind === "announcement_published");
    expect(own).toHaveLength(1);

    const { listAllAnnouncementsTool } = await import("../services/tools");
    const all = await listAllAnnouncementsTool(adminCtx());
    if (!all.ok) return;
    const found = all.data.announcements.find((a) => a.id === created.data.announcementId);
    expect(typeof found?.recipientCount).toBe("number");
    expect(found!.recipientCount!).toBeGreaterThanOrEqual(1);
  });

  it("çoklu kural (rules[]): iki ayrı kuralla eşleşen kullanıcı yine TEK bildirim alır", async () => {
    const created = await createAnnouncementTool(adminCtx(), {
      title: "Öğretmenlere + piyanoculara",
      body: "y",
      audienceType: "teachers",
      rules: [
        { audienceType: "teachers" },
        { audienceType: "instrument", audienceRef: { instrument: ["Piyano"] } },
      ],
      status: "published",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listNotificationsTool(teacherCtx(T1_TEACHER_ID, T1_USER_ID));
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.notifications.filter((n) => n.kind === "announcement_published")).toHaveLength(1);
  });

  it("draft -> published geçişinde bildirim üretilir; published -> published tekrarında ikinci bildirim OLUŞMAZ", async () => {
    const created = await createAnnouncementTool(adminCtx(), {
      title: "Genel duyuru",
      body: "y",
      audienceType: "teachers",
      status: "draft",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const beforePublish = await listNotificationsTool(teacherCtx(T1_TEACHER_ID, T1_USER_ID));
    if (beforePublish.ok) {
      expect(beforePublish.data.notifications.filter((n) => n.kind === "announcement_published")).toHaveLength(0);
    }

    await updateAnnouncementStatusTool(adminCtx(), {
      announcementId: created.data.announcementId,
      status: "published",
    });
    const afterFirstPublish = await listNotificationsTool(teacherCtx(T1_TEACHER_ID, T1_USER_ID));
    expect(afterFirstPublish.ok).toBe(true);
    if (!afterFirstPublish.ok) return;
    expect(afterFirstPublish.data.notifications.filter((n) => n.kind === "announcement_published")).toHaveLength(1);

    // Tekrar "published" durumuna geçiş isteği (gerçek bir durum DEĞİŞİKLİĞİ değil) — ikinci bildirim üretmemeli.
    await updateAnnouncementStatusTool(adminCtx(), {
      announcementId: created.data.announcementId,
      status: "published",
    });
    const afterSecondCall = await listNotificationsTool(teacherCtx(T1_TEACHER_ID, T1_USER_ID));
    expect(afterSecondCall.ok).toBe(true);
    if (!afterSecondCall.ok) return;
    expect(afterSecondCall.data.notifications.filter((n) => n.kind === "announcement_published")).toHaveLength(1);
  });

  it("hedef dışı öğretmen bildirim almaz (branch hedeflemesi)", async () => {
    const data = await readData();
    const otherBranchTeacher = data.teachers.find((t) => t.id !== T1_TEACHER_ID && t.branchId !== "erzene");
    expect(otherBranchTeacher).toBeDefined();
    if (!otherBranchTeacher) return;

    await createAnnouncementTool(adminCtx(), {
      title: "Erzene şubesi",
      body: "y",
      audienceType: "branch",
      audienceRef: { branchId: "erzene" },
      status: "published",
    });

    const { getUserIdByTeacherId } = await import("../auth/users");
    const otherUserId = await getUserIdByTeacherId(DEFAULT_TENANT_ID, otherBranchTeacher.id);
    expect(otherUserId).toBeTruthy();
    if (!otherUserId) return;

    const list = await listNotificationsTool(teacherCtx(otherBranchTeacher.id, otherUserId));
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.notifications.filter((n) => n.kind === "announcement_published")).toHaveLength(0);
  });

  it("aktif portal erişimi olan bir veli (GUARDIAN), hedefteyse bildirim alır", async () => {
    const data = await readData();
    const student = data.students[0];
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "guardian-1" }, student.id, "GUARDIAN");

    await createAnnouncementTool(adminCtx(), {
      title: "Herkese",
      body: "y",
      audienceType: "all",
      status: "published",
    });

    const list = await listNotificationsTool({
      role: "STUDENT",
      userId: "guardian-1",
      tenantId: DEFAULT_TENANT_ID,
      studentId: student.id,
      channel: "web",
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data.notifications.filter((n) => n.kind === "announcement_published")).toHaveLength(1);
  });
});
