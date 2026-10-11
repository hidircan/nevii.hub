import { describe, it, expect, vi } from "vitest";
import {
  registerPushToken,
  resolveAppVariant,
  type PushDeps,
  type PushRegistrationResult,
} from "../push-registration";
import { resolvePushDestination } from "../push-destination";

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../../auth/token-storage", () => ({
  getAccessToken: async () => null,
  getRefreshToken: async () => null,
  setTokens: async () => undefined,
  clearTokens: async () => undefined,
  getStoredEmail: async () => null,
  setStoredEmail: async () => undefined,
  clearStoredEmail: async () => undefined,
}));

function deps(overrides?: Partial<PushDeps>): PushDeps {
  return {
    isDevice: () => true,
    getPermission: async () => "granted",
    requestPermission: async () => "granted",
    getExpoPushToken: async () => "ExponentPushToken[test-token-abc123]",
    ensureAndroidChannel: async () => undefined,
    appVariant: () => "development",
    deviceId: async () => null,
    postToken: async () => true,
    ...overrides,
  };
}

describe("push kaydı", () => {
  it("izinli fiziksel cihaz token'ı sunucuya yazar", async () => {
    const postToken = vi.fn(async () => true);
    const result: PushRegistrationResult = await registerPushToken(deps({ postToken }));
    expect(result).toEqual({ status: "registered" });
    expect(postToken).toHaveBeenCalledOnce();
    const firstCall = postToken.mock.calls[0];
    expect(firstCall).toBeDefined();
    const body = (firstCall as unknown[])[0] as { expoPushToken: string; platform: string };
    expect(body.expoPushToken).toMatch(/^ExponentPushToken\[/);
    expect(body.platform).toBe("ios");
  });

  it("emülatörde sunucuya İSTEK YOK", async () => {
    const postToken = vi.fn(async () => true);
    const result = await registerPushToken(deps({ isDevice: () => false, postToken }));
    expect(result).toEqual({ status: "skipped", reason: "not-device" });
    expect(postToken).not.toHaveBeenCalled();
  });

  it("izin reddedilirse sunucuya İSTEK YOK", async () => {
    const postToken = vi.fn(async () => true);
    const result = await registerPushToken(
      deps({ getPermission: async () => "denied", requestPermission: async () => "denied", postToken })
    );
    expect(result).toEqual({ status: "denied" });
    expect(postToken).not.toHaveBeenCalled();
  });

  it("geçersiz token biçimi sunucuya gitmez", async () => {
    const postToken = vi.fn(async () => true);
    const result = await registerPushToken(deps({ getExpoPushToken: async () => "bogus", postToken }));
    expect(result.status).toBe("skipped");
    expect(postToken).not.toHaveBeenCalled();
  });

  it("sunucu reddi ve ağ hatası registered DÖNMEZ", async () => {
    expect(await registerPushToken(deps({ postToken: async () => false }))).toEqual({
      status: "skipped",
      reason: "server-rejected",
    });
    expect(await registerPushToken(deps({ getExpoPushToken: async () => { throw new Error("net"); } }))).toEqual({
      status: "skipped",
      reason: "network",
    });
  });
});

describe("uygulama varyantı", () => {
  it("geçerli EXPO_PUBLIC_APP_VARIANT kazanır, geçersizde __DEV__ eşlemesi", () => {
    process.env.EXPO_PUBLIC_APP_VARIANT = "preview";
    expect(resolveAppVariant()).toBe("preview");
    process.env.EXPO_PUBLIC_APP_VARIANT = "bogus";
    expect(resolveAppVariant()).toBe("development");
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  });
});

describe("push deep-link hedefleri", () => {
  it("ders hatırlatması role göre programa gider", () => {
    const payload = { kind: "lesson_reminder_1h", lessonId: "l1" };
    expect(resolvePushDestination(payload, "teacher")).toBe("/(teacher)/bugun");
    expect(resolvePushDestination(payload, "student")).toBe("/(student)/dersler");
    expect(resolvePushDestination(payload, "parent")).toBe("/(parent)/dersler");
  });

  it("ödev/ödeme/iş kategorileri doğrulanmış ekranlara gider", () => {
    expect(resolvePushDestination({ kind: "homework_due_date_changed" }, "teacher")).toBe("/(teacher)/odevlerim");
    expect(resolvePushDestination({ kind: "payment_overdue" }, "parent")).toBe("/(parent)/odemeler");
    expect(resolvePushDestination({ kind: "payment_received" }, "admin")).toBe("/(admin)/islemler/finans");
    expect(resolvePushDestination({ kind: "task_due_today" }, "admin")).toBe("/(admin)/islemler/is-takip");
  });

  it("bilinmeyen kategori ve mobil ekranı olmayan kategori merkeze düşer (ölü link YOK)", () => {
    expect(resolvePushDestination({ kind: "leave_pending_approval" }, "admin")).toBe("/notifications");
    expect(resolvePushDestination({ kind: "some_future_kind" }, "student")).toBe("/notifications");
    expect(resolvePushDestination({}, null)).toBe("/notifications");
  });
});
