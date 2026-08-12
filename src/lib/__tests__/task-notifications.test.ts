import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { createTaskTool, updateTaskTool } from "../services/tools";
import { TASKS_FILE } from "../tasks";
import { listAllNotifications, NOTIFICATIONS_FILE } from "../notifications";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(TASKS_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

/**
 * İş Takip → mevcut bildirim altyapısı köprüsü (Faz 2 madde 3). Yalnızca
 * "sorumlu atandı" olayı — "son tarih yaklaşınca"/"gecikince" bilinçli
 * olarak yapılmadı (bkz. src/lib/task-notifications.ts dosya başı yorumu).
 */
describe("İş Takip → kurum-içi bildirim (yalnızca sorumlu atama)", () => {
  it("oluşturma anında sorumlu (öğretmen — Teacher.id) atanırsa, o öğretmenin User hesabına bildirim gider", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Kayıt formunu güncelle",
      category: "Kayıt",
      assigneeId: "t2", // bootstrap: user_teacher_t2 -> teacherId "t2"
    });
    expect(res.ok).toBe(true);

    const notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    const taskNotif = notifications.find((n) => n.kind === "task_new_assignment" || n.kind === "task_assigned");
    expect(taskNotif).toBeDefined();
    expect(taskNotif?.targetUserId).toBe("user_teacher_t2");
    expect(taskNotif?.body).toContain("Kayıt formunu güncelle");
  });

  it("sorumlusuz oluşturulan görev bildirim ÜRETMEZ", async () => {
    const res = await createTaskTool(ctx(), { title: "Sorumlusuz görev", category: "Kayıt" });
    expect(res.ok).toBe(true);
    const notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    expect(
      notifications.filter((n) => n.kind === "task_new_assignment" || n.kind === "task_assigned")
    ).toHaveLength(0);
  });

  it("sonradan sorumlu atanırsa (updateTaskTool) bildirim gider; sorumlu DEĞİŞMEZSE tekrar bildirim gitmez", async () => {
    const created = await createTaskTool(ctx(), { title: "Sonradan atanacak", category: "Kayıt" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const assign = await updateTaskTool(ctx(), { taskId: created.data.taskId, assigneeId: "t2" });
    expect(assign.ok).toBe(true);
    let notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    expect(
      notifications.filter((n) => n.kind === "task_new_assignment" || n.kind === "task_assigned")
    ).toHaveLength(1);

    // Aynı sorumluyla tekrar güncelleme — YENİ bir bildirim OLUŞMAMALI.
    const noChange = await updateTaskTool(ctx(), { taskId: created.data.taskId, title: "Sonradan atanacak (2)" });
    expect(noChange.ok).toBe(true);
    notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    expect(
      notifications.filter((n) => n.kind === "task_new_assignment" || n.kind === "task_assigned")
    ).toHaveLength(1);
  });

  it("bilinmeyen/eşleşmeyen bir assigneeId için sessizce bildirim ÜRETİLMEZ, görev işlemi yine de başarılı olur", async () => {
    const res = await createTaskTool(ctx(), {
      title: "Eşleşmeyen sorumlu",
      category: "Kayıt",
      assigneeId: "no-such-user-or-teacher",
    });
    expect(res.ok).toBe(true);
    const notifications = await listAllNotifications(DEFAULT_TENANT_ID);
    expect(
      notifications.filter((n) => n.kind === "task_new_assignment" || n.kind === "task_assigned")
    ).toHaveLength(0);
  });
});
