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

describe("EPIC 1 — listNotificationsTool cursor sayfalama", () => {
  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      await createNotification({
        tenantId: DEFAULT_TENANT_ID,
        targetUserId: "user_page",
        kind: "info",
        title: `Bildirim ${i}`,
        body: "x",
      });
    }
  }

  it("ilk sayfa: limit kadar döner ve nextCursor verir", async () => {
    await seed(5);
    const result = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.notifications).toHaveLength(3);
    expect(result.data.nextCursor).not.toBeNull();
    expect(result.data.unreadCount).toBe(5);
  });

  it("ikinci sayfa: cursor ile devam eder, tekrar/eksik olmadan tüm öğeleri kapsar, kararlı sırada", async () => {
    await seed(5);
    const page1 = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 3 });
    if (!page1.ok || !page1.data.nextCursor) throw new Error("page1 failed");
    const page2 = await listNotificationsTool(ctx({ userId: "user_page" }), {
      cursor: page1.data.nextCursor,
      limit: 3,
    });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.data.notifications).toHaveLength(2);
    expect(page2.data.nextCursor).toBeNull();

    const ids1 = page1.data.notifications.map((n) => n.id);
    const ids2 = page2.data.notifications.map((n) => n.id);
    expect(new Set([...ids1, ...ids2]).size).toBe(5);
    const all = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 100 });
    if (!all.ok) throw new Error("all failed");
    expect([...ids1, ...ids2]).toEqual(all.data.notifications.map((n) => n.id));
  });

  it("geçersiz cursor: temiz doğrulama hatası döner, crash olmaz", async () => {
    await seed(1);
    const result = await listNotificationsTool(ctx({ userId: "user_page" }), { cursor: "not-base64-json" });
    expect(result.ok).toBe(false);
  });

  it("tenant/kullanıcı izolasyonu sayfalamada da korunur", async () => {
    await seed(3);
    await createNotification({
      tenantId: DEFAULT_TENANT_ID,
      targetUserId: "other_user",
      kind: "info",
      title: "başkasının",
      body: "x",
    });
    const result = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 100 });
    if (!result.ok) throw new Error("failed");
    expect(result.data.notifications.every((n) => n.title !== "başkasının")).toBe(true);
  });

  it("unreadCount toplam gelen kutusunu yansıtır, yalnızca yüklenen sayfayı değil", async () => {
    await seed(5);
    const page1 = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 1 });
    if (!page1.ok) throw new Error("failed");
    expect(page1.data.notifications).toHaveLength(1);
    expect(page1.data.unreadCount).toBe(5);
  });

  it("markNotificationRead sayfalamadan sonra da çalışmaya devam eder", async () => {
    await seed(1);
    const page = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 10 });
    if (!page.ok) throw new Error("failed");
    const target = page.data.notifications[0];
    const marked = await markNotificationReadTool(ctx({ userId: "user_page" }), {
      notificationId: target.id,
    });
    expect(marked.ok).toBe(true);
    const after = await listNotificationsTool(ctx({ userId: "user_page" }), { limit: 10 });
    if (!after.ok) throw new Error("failed");
    expect(after.data.unreadCount).toBe(0);
  });
});

/**
 * P0 (2026-09-07) — json/memory yolundaki bildirim yazımı eskiden KİLİTSİZ bir
 * oku-değiştir-yaz'dı: eşzamanlı iki yazımdan biri SESSİZCE KAYBOLUYORDU. Bu,
 * ders taşıma bildirimlerini paralelleştirme denemesinde ölçülerek görülmüş ve
 * o zaman kök neden düzeltilmeden paralelleştirme geri alınmıştı
 * (docs/performance/ADMIN_WEB_P0_BASELINE.md §7.9). Kök neden bu turda
 * kapatıldı — bu test onu kilitler.
 */
describe("createNotification · eşzamanlı yazım (json modu)", () => {
  it("aynı anda yazılan bildirimlerin HİÇBİRİ kaybolmaz", async () => {
    const total = 12;
    await Promise.all(
      Array.from({ length: total }, (_, i) =>
        createNotification({
          tenantId: DEFAULT_TENANT_ID,
          targetUserId: `race_user_${i % 3}`,
          kind: "test_race",
          title: `T${i}`,
          body: `B${i}`,
        })
      )
    );

    const seen = new Set<string>();
    for (const userId of ["race_user_0", "race_user_1", "race_user_2"]) {
      for (const n of await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId })) {
        if (n.kind === "test_race") seen.add(n.body);
      }
    }
    expect(seen.size).toBe(total);
  });
});
