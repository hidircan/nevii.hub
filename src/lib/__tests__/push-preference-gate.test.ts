import { describe, it, expect } from "vitest";
import { setNotificationPreferencesTool } from "../services/tools";
import type { ServiceContext } from "../services/context";

/**
 * pushEnabled kapısı: altyapı kapalıyken her zaman false (fail-closed);
 * `PUSH_ENABLED=true` + token varken kullanıcı tercihi kabul edilir.
 */
function studentCtx(): ServiceContext {
  return {
    role: "STUDENT",
    userId: "user_push_pref_test",
    tenantId: "tenant_nilufer_acar",
    channel: "mobile",
    requestId: "test-push-pref-gate",
  } as ServiceContext;
}

describe("pushEnabled tercih kapısı", () => {
  it("altyapı kapalıyken pushEnabled=true isteği false'a zorlanır", async () => {
    delete process.env.PUSH_ENABLED;
    delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    const res = await setNotificationPreferencesTool(studentCtx(), {
      updates: [{ category: "lesson_reminder_1h", inAppEnabled: true, pushEnabled: true }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.data.preferences.find((p) => p.category === "lesson_reminder_1h");
    expect(row?.pushEnabled).toBe(false);
  });

  it("altyapı açıkken kullanıcı tercihi kabul edilir", async () => {
    process.env.PUSH_ENABLED = "true";
    process.env.EXPO_PUSH_ACCESS_TOKEN = "test-token";
    try {
      const res = await setNotificationPreferencesTool(studentCtx(), {
        updates: [{ category: "lesson_reminder_1h", inAppEnabled: true, pushEnabled: true }],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const row = res.data.preferences.find((p) => p.category === "lesson_reminder_1h");
      expect(row?.pushEnabled).toBe(true);
    } finally {
      delete process.env.PUSH_ENABLED;
      delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    }
  });

  it("yeni hatırlatma kategorileri tercih listesinde döner", async () => {
    const { getNotificationPreferencesTool } = await import("../services/tools");
    const res = await getNotificationPreferencesTool(studentCtx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const cats = res.data.preferences.map((p) => p.category);
    expect(cats).toContain("lesson_reminder_1d");
    expect(cats).toContain("lesson_reminder_1h");
    expect(cats).toContain("lesson_reminder_15m");
  });
});
