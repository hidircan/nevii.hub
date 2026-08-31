import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import {
  getNotificationPreferences,
  setNotificationPreferences,
  resetNotificationPreferences,
  isCategoryEnabledForUser,
  NOTIFICATION_PREFERENCES_FILE,
} from "../notification-preferences";
import {
  getNotificationPreferencesTool,
  setNotificationPreferencesTool,
  resetNotificationPreferencesTool,
  createLeaveRequestTool,
  createStaffMemberTool,
  createTaskTool,
} from "../services/tools";
import { notifyAdmins } from "../manager-notifications";
import { listAllNotifications, NOTIFICATIONS_FILE } from "../notifications";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { resolveNotificationHref } from "../notification-href";
import { LEAVE_FILE } from "../leave";
import { STAFF_FILE } from "../staff";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "user_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(NOTIFICATION_PREFERENCES_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(LEAVE_FILE, { force: true });
  await fs.rm(STAFF_FILE, { force: true });
});

describe("Bildirim tercih store (json)", () => {
  it("kayıt yokken kategori varsayılanlarını döner", async () => {
    const prefs = await getNotificationPreferences(DEFAULT_TENANT_ID, "user_admin");
    const leave = prefs.find((p) => p.category === "leave_new_request");
    const upcoming = prefs.find((p) => p.category === "lesson_upcoming");
    expect(leave?.inAppEnabled).toBe(true);
    expect(upcoming?.inAppEnabled).toBe(true);
  });

  it("upsert ve isCategoryEnabledForUser tutarlı", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_admin", [
      { category: "leave_new_request", inAppEnabled: false },
    ]);
    expect(await isCategoryEnabledForUser(DEFAULT_TENANT_ID, "user_admin", "leave_new_request")).toBe(
      false
    );
    expect(await isCategoryEnabledForUser(DEFAULT_TENANT_ID, "user_admin", "task_new_assignment")).toBe(
      true
    );
  });

  it("tenant+user izolasyonu — başka kullanıcı etkilenmez", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_admin", [
      { category: "payment_overdue", inAppEnabled: false },
    ]);
    expect(await isCategoryEnabledForUser(DEFAULT_TENANT_ID, "user_owner_nilufer", "payment_overdue")).toBe(
      true
    );
  });

  it("reset varsayılana döner", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_admin", [
      { category: "leave_new_request", inAppEnabled: false },
    ]);
    await resetNotificationPreferences(DEFAULT_TENANT_ID, "user_admin");
    expect(await isCategoryEnabledForUser(DEFAULT_TENANT_ID, "user_admin", "leave_new_request")).toBe(
      true
    );
  });
});

describe("Bildirim tercih tools (RBAC)", () => {
  it("admin kendi tercihini okur/yazar", async () => {
    const got = await getNotificationPreferencesTool(ctx());
    expect(got.ok).toBe(true);

    const set = await setNotificationPreferencesTool(ctx(), {
      updates: [{ category: "task_new_assignment", inAppEnabled: false }],
    });
    expect(set.ok).toBe(true);
    if (set.ok) {
      expect(set.data.preferences.find((p) => p.category === "task_new_assignment")?.inAppEnabled).toBe(
        false
      );
    }
  });

  it("bilinmeyen kategori tercihini reddeder", async () => {
    const res = await setNotificationPreferencesTool(ctx(), {
      updates: [{ category: "not_a_real_category", inAppEnabled: true }],
    });
    expect(res.ok).toBe(false);
  });

  it("PARENT/STUDENT kendi tercihini okur/yazar (Portal bildirim ayarları — FAZ1 düzeltmesi)", async () => {
    // Bu tool önceden PARENT/STUDENT'ı tamamen reddediyordu — /veli ve /ogrenci
    // ayarlar sayfaları bu yüzden hiç çalışmıyordu. Artık kendi (tenant, userId)
    // kapsamında okuyup yazabiliyor; başka rolün verisine erişim yok (ayrı test).
    const parentCtx = ctx({ role: "STUDENT", userId: "parent1", studentId: "s1" });
    const got = await getNotificationPreferencesTool(parentCtx);
    expect(got.ok).toBe(true);

    const set = await setNotificationPreferencesTool(parentCtx, {
      updates: [{ category: "lesson_upcoming", inAppEnabled: false }],
    });
    expect(set.ok).toBe(true);
    if (set.ok) {
      expect(set.data.preferences.find((p) => p.category === "lesson_upcoming")?.inAppEnabled).toBe(false);
    }

    const studentCtx = ctx({ role: "STUDENT", userId: "student1", studentId: "s1" });
    const gotStudent = await getNotificationPreferencesTool(studentCtx);
    expect(gotStudent.ok).toBe(true);
  });

  it("PARENT'ın yazdığı tercih başka bir kullanıcıyı etkilemez", async () => {
    const parentA = ctx({ role: "STUDENT", userId: "parentA", studentId: "s1" });
    const parentB = ctx({ role: "STUDENT", userId: "parentB", studentId: "s2" });
    await setNotificationPreferencesTool(parentA, {
      updates: [{ category: "lesson_upcoming", inAppEnabled: false }],
    });
    const bPrefs = await getNotificationPreferencesTool(parentB);
    expect(bPrefs.ok).toBe(true);
    if (bPrefs.ok) {
      // parentB never wrote an override — still sees the category default, untouched by parentA's write.
      expect(bPrefs.data.preferences.find((p) => p.category === "lesson_upcoming")?.inAppEnabled).toBe(true);
    }
  });

  it("reset tool varsayılana döner", async () => {
    await setNotificationPreferencesTool(ctx(), {
      updates: [{ category: "leave_new_request", inAppEnabled: false }],
    });
    const reset = await resetNotificationPreferencesTool(ctx());
    expect(reset.ok).toBe(true);
    if (reset.ok) {
      expect(reset.data.preferences.find((p) => p.category === "leave_new_request")?.inAppEnabled).toBe(
        true
      );
    }
  });
});

describe("notifyAdmins + olay köprüleri", () => {
  it("notifyAdmins tercih kapalı yöneticiye yazmaz", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_admin", [
      { category: "leave_new_request", inAppEnabled: false },
    ]);
    await notifyAdmins(DEFAULT_TENANT_ID, "leave_new_request", {
      title: "Test izin",
      body: "Detay: /panel/personel/izinler",
    });
    const all = await listAllNotifications(DEFAULT_TENANT_ID);
    expect(all.filter((n) => n.targetUserId === "user_admin" && n.kind === "leave_new_request")).toHaveLength(
      0
    );
    // Diğer adminler (varsayılan açık) alabilir
    expect(all.some((n) => n.targetUserId !== "user_admin" && n.kind === "leave_new_request")).toBe(true);
  });

  it("createLeaveRequestTool diğer adminlere leave_new_request üretir, oluşturanı hariç tutar", async () => {
    const staff = await createStaffMemberTool(ctx(), { name: "Test Personel", position: "Sekreter" });
    expect(staff.ok).toBe(true);
    if (!staff.ok) return;

    const res = await createLeaveRequestTool(ctx({ userId: "user_admin" }), {
      staffId: staff.data.staffId,
      type: "annual",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const all = await listAllNotifications(DEFAULT_TENANT_ID);
    const leaveNotifs = all.filter((n) => n.kind === "leave_new_request");
    expect(leaveNotifs.length).toBeGreaterThan(0);
    expect(leaveNotifs.every((n) => n.targetUserId !== "user_admin")).toBe(true);
  });

  it("görev atama tercihi kapalıysa bildirim üretilmez", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_teacher_t2", [
      { category: "task_new_assignment", inAppEnabled: false },
    ]);
    const res = await createTaskTool(ctx(), {
      title: "Tercih kapalı görev",
      category: "Kayıt",
      assigneeId: "t2",
    });
    expect(res.ok).toBe(true);
    const all = await listAllNotifications(DEFAULT_TENANT_ID);
    expect(all.filter((n) => n.targetUserId === "user_teacher_t2")).toHaveLength(0);
  });
});

describe("mobil ayar ekranı rol filtresi ön koşulu", () => {
  it("TEACHER, SCHOOL_ADMIN ve STUDENT (Karma Öğrenci Portalı — veli/öğrenci) en az bir implemented kategoride uygun", async () => {
    const { NOTIFICATION_CATEGORIES } = await import("../notification-categories");
    expect(NOTIFICATION_CATEGORIES.some((c) => c.implemented && c.roles.includes("TEACHER"))).toBe(true);
    expect(NOTIFICATION_CATEGORIES.some((c) => c.implemented && c.roles.includes("SCHOOL_ADMIN"))).toBe(true);
    expect(NOTIFICATION_CATEGORIES.some((c) => c.implemented && c.roles.includes("STUDENT"))).toBe(true);
  });
});

describe("resolveNotificationHref", () => {
  it("body Detay yolunu ve kind varsayılanını güvenle çözümler", () => {
    expect(resolveNotificationHref("task_new_assignment", 'x Detay: /panel/is-takip/abc')).toBe(
      "/panel/is-takip/abc"
    );
    expect(resolveNotificationHref("leave_new_request")).toBe("/panel/personel/izinler");
    expect(resolveNotificationHref("payment_overdue")).toBe("/panel/odemeler");
    expect(resolveNotificationHref("x", "Detay: https://evil.com")).toBeNull();
    expect(resolveNotificationHref("x", "Detay: //evil.com")).toBeNull();
  });
});
