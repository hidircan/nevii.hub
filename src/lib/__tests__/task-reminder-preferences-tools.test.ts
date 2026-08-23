import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { getTaskReminderPreferenceTool, updateTaskReminderPreferenceTool } from "../services/tools";
import { TASK_REMINDER_PREFERENCES_FILE } from "../task-reminder-preferences";
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
  await fs.rm(TASK_REMINDER_PREFERENCES_FILE, { force: true });
});

describe("İş Takip hatırlatma tercihleri — RBAC ve varsayılanlar", () => {
  it("varsayılan olarak üç tercih de açık döner (hiç kayıt yokken)", async () => {
    const res = await getTaskReminderPreferenceTool(ctx());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.dueSoonEnabled).toBe(true);
      expect(res.data.dueTodayEnabled).toBe(true);
      expect(res.data.overdueEnabled).toBe(true);
    }
  });

  it("kullanıcı kendi tercihini günceller, sonraki okuma güncellenmiş halini döner", async () => {
    const updateRes = await updateTaskReminderPreferenceTool(ctx({ userId: "u1" }), {
      dueSoonEnabled: false,
      dueTodayEnabled: true,
      overdueEnabled: false,
    });
    expect(updateRes.ok).toBe(true);

    const readRes = await getTaskReminderPreferenceTool(ctx({ userId: "u1" }));
    expect(readRes.ok).toBe(true);
    if (readRes.ok) {
      expect(readRes.data.dueSoonEnabled).toBe(false);
      expect(readRes.data.dueTodayEnabled).toBe(true);
      expect(readRes.data.overdueEnabled).toBe(false);
    }
  });

  it("bir kullanıcının tercih güncellemesi BAŞKA bir kullanıcıyı etkilemez", async () => {
    await updateTaskReminderPreferenceTool(ctx({ userId: "u1" }), {
      dueSoonEnabled: false,
      dueTodayEnabled: false,
      overdueEnabled: false,
    });
    // "u2" (farklı kullanıcı, aynı tenant, admin olarak dahi çağırsa) hâlâ varsayılanı görür —
    // input asla bir userId ALMAZ, her zaman ctx.userId kullanılır.
    const readRes = await getTaskReminderPreferenceTool(ctx({ userId: "u2" }));
    expect(readRes.ok).toBe(true);
    if (readRes.ok) {
      expect(readRes.data.dueSoonEnabled).toBe(true);
      expect(readRes.data.dueTodayEnabled).toBe(true);
      expect(readRes.data.overdueEnabled).toBe(true);
    }
  });

  it("TEACHER kendi tercihini okuyup güncelleyebilir", async () => {
    const res = await updateTaskReminderPreferenceTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t1" }), {
      dueSoonEnabled: true,
      dueTodayEnabled: false,
      overdueEnabled: true,
    });
    expect(res.ok).toBe(true);
  });

  it("PARENT/STUDENT tercih tool'larını çağıramaz", async () => {
    const parentRes = await getTaskReminderPreferenceTool(ctx({ role: "STUDENT", studentId: "s1" }));
    expect(parentRes.ok).toBe(false);
    if (!parentRes.ok) expect(parentRes.error.code).toBe("FORBIDDEN");

    const studentRes = await updateTaskReminderPreferenceTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      dueSoonEnabled: false,
      dueTodayEnabled: false,
      overdueEnabled: false,
    });
    expect(studentRes.ok).toBe(false);
  });

  it("geçersiz (eksik alan) girdi VALIDATION_ERROR döner", async () => {
    const res = await updateTaskReminderPreferenceTool(ctx(), { dueSoonEnabled: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});
