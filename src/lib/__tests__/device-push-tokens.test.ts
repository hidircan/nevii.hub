import { describe, it, expect, beforeEach } from "vitest";
import {
  DEVICE_PUSH_TOKENS_FILE,
  disableDevicePushTokens,
  listEnabledDevicePushTokens,
  maskPushToken,
  registerDevicePushToken,
} from "../device-push-tokens";

const T = "tenant_push_token_test";
const U = "user_push_token_test";

/**
 * DevicePushToken deposu — idempotency, çok-cihaz, logout revocation,
 * maskeleme. Dosya deposu bu test dosyasına özel temizlenir.
 */
async function cleanup() {
  const fs = await import("fs/promises");
  try {
    const raw = await fs.readFile(DEVICE_PUSH_TOKENS_FILE, "utf8");
    const rows = JSON.parse(raw) as Array<{ tenantId?: string }>;
    await fs.writeFile(DEVICE_PUSH_TOKENS_FILE, JSON.stringify(rows.filter((r) => r.tenantId !== T), null, 2));
  } catch {
    /* yoksa sorun değil */
  }
}

describe("device push token deposu", () => {
  beforeEach(cleanup);

  it("idempotent kayıt — aynı token ikinci satır oluşturmaz", async () => {
    const a = await registerDevicePushToken({ tenantId: T, userId: U, platform: "ios", expoPushToken: "ExponentPushToken[aaa]" });
    const b = await registerDevicePushToken({ tenantId: T, userId: U, platform: "ios", expoPushToken: "ExponentPushToken[aaa]" });
    expect(a.id).toBe(b.id);
    expect(await listEnabledDevicePushTokens(T, U)).toHaveLength(1);
  });

  it("aynı kullanıcı çok cihaz kullanabilir", async () => {
    await registerDevicePushToken({ tenantId: T, userId: U, platform: "ios", expoPushToken: "ExponentPushToken[aaa]" });
    await registerDevicePushToken({ tenantId: T, userId: U, platform: "android", expoPushToken: "ExponentPushToken[bbb]" });
    expect(await listEnabledDevicePushTokens(T, U)).toHaveLength(2);
  });

  it("permission denied cihaz gönderim hedefi değildir", async () => {
    await registerDevicePushToken({ tenantId: T, userId: U, platform: "android", expoPushToken: "ExponentPushToken[ccc]", permission: "denied" });
    expect(await listEnabledDevicePushTokens(T, U)).toHaveLength(0);
  });

  it("logout tek token'ı veya tümünü devre dışı bırakır (kapsam: kendi tenant+user)", async () => {
    await registerDevicePushToken({ tenantId: T, userId: U, platform: "ios", expoPushToken: "ExponentPushToken[aaa]" });
    await registerDevicePushToken({ tenantId: T, userId: U, platform: "android", expoPushToken: "ExponentPushToken[bbb]" });
    await registerDevicePushToken({ tenantId: T, userId: "other", platform: "ios", expoPushToken: "ExponentPushToken[aaa]" });
    expect(await disableDevicePushTokens(T, U, "ExponentPushToken[aaa]")).toBe(1);
    expect(await listEnabledDevicePushTokens(T, U)).toHaveLength(1);
    expect(await disableDevicePushTokens(T, U)).toBe(1);
    expect(await listEnabledDevicePushTokens(T, U)).toHaveLength(0);
    // Başka kullanıcının satırı etkilenmedi.
    expect(await listEnabledDevicePushTokens(T, "other")).toHaveLength(1);
    await disableDevicePushTokens(T, "other");
  });

  it("maskeleme ham değeri sızdırmaz", async () => {
    const masked = maskPushToken("ExponentPushToken[abcdef123456]");
    expect(masked).not.toContain("abcdef123456");
    expect(masked.length).toBeLessThan("ExponentPushToken[abcdef123456]".length);
  });
});
