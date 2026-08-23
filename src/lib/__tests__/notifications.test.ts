import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  createNotification,
  listNotificationsForUser,
  markNotificationRead,
  clearNotifications,
  NOTIFICATIONS_FILE,
} from "../notifications";
import {
  listNotificationsTool,
  markNotificationReadTool,
  updateCommunicationPreferenceTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "STUDENT",
    userId: "parent1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("EPIC 1 — notifications modülü (src/lib/notifications)", () => {
  it("tenant + studentId ile hedeflenen bildirim yalnızca o öğrenciye görünür", async () => {
    await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetStudentId: "s1",
      kind: "payment_overdue",
      title: "Gecikmiş ödeme",
      body: "Test",
    });

    const forS1 = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, studentId: "s1" });
    expect(forS1).toHaveLength(1);

    const forS2 = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, studentId: "s2" });
    expect(forS2).toHaveLength(0);
  });

  it("tenant izolasyonu: başka tenant'ın bildirimini görmez", async () => {
    await createNotification({
      tenantId: "other-tenant",
      targetStudentId: "s1",
      kind: "payment_overdue",
      title: "x",
      body: "y",
    });
    const forDefaultTenant = await listNotificationsForUser({
      tenantId: DEFAULT_TENANT_ID,
      studentId: "s1",
    });
    expect(forDefaultTenant).toHaveLength(0);
  });

  it("markNotificationRead: yalnızca hedeflenen kullanıcı okundu işaretleyebilir, başkası null alır", async () => {
    const n = await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetUserId: "user1",
      kind: "info",
      title: "x",
      body: "y",
    });

    const deniedForOther = await markNotificationRead(
      { tenantId: DEFAULT_TENANT_ID, userId: "user2" },
      n.id
    );
    expect(deniedForOther).toBeNull();

    const ownRead = await markNotificationRead(
      { tenantId: DEFAULT_TENANT_ID, userId: "user1" },
      n.id
    );
    expect(ownRead?.readAt).toBeDefined();
  });

  it("clearNotifications yalnızca ilgili tenant'ı temizler", async () => {
    await createNotification({ tenantId: "a", targetStudentId: "s1", kind: "x", title: "a", body: "b" });
    await createNotification({ tenantId: "b", targetStudentId: "s1", kind: "x", title: "a", body: "b" });
    await clearNotifications("a");
    expect(await listNotificationsForUser({ tenantId: "a", studentId: "s1" })).toHaveLength(0);
    expect(await listNotificationsForUser({ tenantId: "b", studentId: "s1" })).toHaveLength(1);
  });
});

describe("EPIC 1 — listNotificationsTool / markNotificationReadTool (servis katmanı)", () => {
  it("PARENT yalnızca kendi studentId'sine hedeflenen bildirimleri görür", async () => {
    await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetStudentId: "s1",
      kind: "payment_overdue",
      title: "Bana ait",
      body: "x",
    });
    await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetStudentId: "s2",
      kind: "payment_overdue",
      title: "Başkasına ait",
      body: "x",
    });

    const result = await listNotificationsTool(ctx({ studentId: "s1" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.notifications).toHaveLength(1);
    expect(result.data.notifications[0].title).toBe("Bana ait");
  });

  it("markNotificationReadTool: başka kullanıcının bildirimini okundu işaretleyemez (NOT_FOUND)", async () => {
    const n = await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetStudentId: "s1",
      kind: "payment_overdue",
      title: "x",
      body: "y",
    });
    const result = await markNotificationReadTool(ctx({ studentId: "s2" }), {
      notificationId: n.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("EPIC 1 — updateCommunicationPreferenceTool (opt-out yetkisi)", () => {
  it("veli kendi çocuğu için opt-out ayarlayabilir", async () => {
    const data = await readData();
    const studentId = data.students[0].id;
    await grantStudentAccess(ctx({ studentId }), studentId, "GUARDIAN");
    const result = await updateCommunicationPreferenceTool(ctx({ studentId }), {
      studentId,
      communicationOptOut: true,
    });
    expect(result.ok).toBe(true);
    const after = await readData();
    expect(after.students.find((s) => s.id === studentId)?.communicationOptOut).toBe(true);
  });

  it("veli BAŞKA bir öğrenci için opt-out ayarlayamaz (FORBIDDEN)", async () => {
    const data = await readData();
    const otherStudentId = data.students[1]?.id ?? data.students[0].id;
    const result = await updateCommunicationPreferenceTool(ctx({ studentId: "not-the-owner" }), {
      studentId: otherStudentId,
      communicationOptOut: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("admin herhangi bir öğrenci için opt-out ayarlayabilir", async () => {
    const data = await readData();
    const studentId = data.students[0].id;
    const result = await updateCommunicationPreferenceTool(
      ctx({ role: "SCHOOL_ADMIN", studentId: undefined }),
      { studentId, communicationOptOut: true }
    );
    expect(result.ok).toBe(true);
  });
});
