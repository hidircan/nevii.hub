import { describe, it, expect, afterEach } from "vitest";
import { deliverPushForUser } from "../push/sender";
import { disableDevicePushTokens, registerDevicePushToken } from "../device-push-tokens";
import { setNotificationPreferencesTool } from "../services/tools";
import type { ServiceContext } from "../services/context";

/**
 * Expo Push gönderim katmanı — fail-closed (altyapı kapalıysa HTTP YOK),
 * tercih kapısı, DeviceNotRegistered temizliği. fetchFn enjekte edilir
 * (gerçek Expo çağrısı YOK).
 */
const TENANT = "tenant_nilufer_acar";
const USER = "user_push_sender_test";
const TOKEN = "ExponentPushToken[sender-test-0001]";

function ctx(): ServiceContext {
  return { role: "STUDENT", userId: USER, tenantId: TENANT, channel: "mobile", requestId: "test-push-sender" } as ServiceContext;
}

function enableInfra() {
  process.env.PUSH_ENABLED = "true";
  process.env.EXPO_PUSH_ACCESS_TOKEN = "test-token";
}

afterEach(async () => {
  // Tercih + token dosya deposunda kalıcıdır — testler arası sızmayı önle.
  await setNotificationPreferencesTool(ctx(), {
    updates: [{ category: "lesson_reminder_1h", inAppEnabled: false, pushEnabled: false }],
  });
  delete process.env.PUSH_ENABLED;
  delete process.env.EXPO_PUSH_ACCESS_TOKEN;
  await disableDevicePushTokens(TENANT, USER);
});

async function seedToken() {
  enableInfra();
  await setNotificationPreferencesTool(ctx(), {
    updates: [{ category: "lesson_reminder_1h", inAppEnabled: true, pushEnabled: true }],
  });
  await registerDevicePushToken({ tenantId: TENANT, userId: USER, expoPushToken: TOKEN, platform: "ios", appVariant: "development" });
}

describe("deliverPushForUser", () => {
  it("altyapı kapalıyken HTTP çağrısı yapmaz (skipped)", async () => {
    delete process.env.PUSH_ENABLED;
    delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    let calls = 0;
    const res = await deliverPushForUser(TENANT, USER, "lesson_reminder_1h", { title: "t", body: "b" }, {
      fetchFn: (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch,
    });
    expect(res).toEqual({ outcome: "skipped", sent: 0, invalidated: 0 });
    expect(calls).toBe(0);
  });

  it("tercih kapalıysa göndermez", async () => {
    enableInfra();
    await registerDevicePushToken({ tenantId: TENANT, userId: USER, expoPushToken: TOKEN, platform: "ios", appVariant: "development" });
    let calls = 0;
    const res = await deliverPushForUser(TENANT, USER, "lesson_reminder_1h", { title: "t", body: "b" }, {
      fetchFn: (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch,
    });
    expect(res.outcome).toBe("skipped");
    expect(calls).toBe(0);
  });

  it("tercih açık + kayıtlı cihazda gönderir", async () => {
    await seedToken();
    const fetchFn = (async () =>
      new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 })) as unknown as typeof fetch;
    const res = await deliverPushForUser(TENANT, USER, "lesson_reminder_1h", { title: "t", body: "b" }, { fetchFn });
    expect(res).toEqual({ outcome: "sent", sent: 1, invalidated: 0 });
  });

  it("DeviceNotRegistered cevabında token devre dışı bırakılır", async () => {
    await seedToken();
    const fetchFn = (async () =>
      new Response(JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const res = await deliverPushForUser(TENANT, USER, "lesson_reminder_1h", { title: "t", body: "b" }, { fetchFn });
    expect(res.invalidated).toBe(1);
    const { listEnabledDevicePushTokens } = await import("../device-push-tokens");
    expect(await listEnabledDevicePushTokens(TENANT, USER)).toHaveLength(0);
  });

  it("ignorePreference yalnız dev test akışında tercihi atlar", async () => {
    enableInfra();
    await registerDevicePushToken({ tenantId: TENANT, userId: USER, expoPushToken: TOKEN, platform: "ios", appVariant: "development" });
    const fetchFn = (async () =>
      new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 })) as unknown as typeof fetch;
    const res = await deliverPushForUser(TENANT, USER, "test_push", { title: "t", body: "b" }, { fetchFn, ignorePreference: true });
    expect(res.outcome).toBe("sent");
  });
});
