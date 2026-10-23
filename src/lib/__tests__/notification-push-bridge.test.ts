import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createNotification } from "../notifications";
import { disableDevicePushTokens, listEnabledDevicePushTokens, registerDevicePushToken } from "../device-push-tokens";
import { setNotificationPreferencesTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Bildirim → push köprüsü sözleşmesi.
 *
 * Kural: `createNotification` YALNIZ yeni satır yazdığında push dener.
 * `duplicate` (aynı dedupeKey) push'u TEKRARLAMAZ; `skipPush` veren çağıran
 * (ders hatırlatma sweep'i) kendi push'unu yönetir ve köprü ikinci kez
 * göndermez. `PUSH_ENABLED` kapalıyken HİÇ HTTP çağrısı olmaz.
 */
const TENANT = DEFAULT_TENANT_ID;
const USER = "user_push_bridge_test";
const TOKEN = "ExponentPushToken[bridge-test-0001]";

function ctx(): ServiceContext {
  return { role: "STUDENT", userId: USER, tenantId: TENANT, channel: "mobile", requestId: "test-push-bridge" } as ServiceContext;
}

function enableInfra() {
  process.env.PUSH_ENABLED = "true";
  process.env.EXPO_PUSH_ACCESS_TOKEN = "test-token";
}

async function seedPushEnabled(
  category: "announcement_published" | "lesson_reminder_1h",
  platform: "ios" | "android" = "ios"
) {
  enableInfra();
  await setNotificationPreferencesTool(ctx(), {
    updates: [{ category, inAppEnabled: true, pushEnabled: true }],
  });
  await registerDevicePushToken({
    tenantId: TENANT,
    userId: USER,
    expoPushToken: TOKEN,
    platform,
    appVariant: "development",
  });
}

const okResponse = () =>
  new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 });

beforeEach(() => {
  enableInfra();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await disableDevicePushTokens(TENANT, USER);
  await setNotificationPreferencesTool(ctx(), {
    updates: [
      { category: "announcement_published", inAppEnabled: true, pushEnabled: false },
      { category: "lesson_reminder_1h", inAppEnabled: true, pushEnabled: false },
    ],
  });
  delete process.env.PUSH_ENABLED;
  delete process.env.EXPO_PUSH_ACCESS_TOKEN;
});

describe("createNotification → push köprüsü", () => {
  it("yeni satırda push gönderir: Bearer token + genel kanal + kind", async () => {
    await seedPushEnabled("announcement_published", "android");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return okResponse();
    });

    const res = await createNotification({
      tenantId: TENANT,
      targetUserId: USER,
      kind: "announcement_published",
      title: "Yeni duyuru",
      body: "Piyano atölyesi",
    });

    expect(res.status).toBe("created");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("exp.host");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer test-token");
    const payload = JSON.parse(String(calls[0]!.init.body)) as {
      to: string;
      title: string;
      body: string;
      channelId: string;
      data: { kind: string };
    };
    expect(payload.to).toBe(TOKEN);
    expect(payload.title).toBe("Yeni duyuru");
    expect(payload.channelId).toBe("general");
    expect(payload.data.kind).toBe("announcement_published");
  });

  it("ders kategorisi ders kanalına gider (Android HIGH kanal eşlemesi)", async () => {
    await seedPushEnabled("lesson_reminder_1h", "android");
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return okResponse();
    });

    await createNotification({
      tenantId: TENANT,
      targetUserId: USER,
      kind: "lesson_reminder_1h",
      title: "Ders hatırlatması",
      body: "1 saat kaldı",
    });

    expect(JSON.parse(bodies[0]!).channelId).toBe("lesson-reminders");
  });

  it("aynı dedupeKey ikinci kez push GÖNDERMEZ (duplicate → sessiz)", async () => {
    await seedPushEnabled("announcement_published", "android");
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return okResponse();
    });
    const input = {
      tenantId: TENANT,
      targetUserId: USER,
      kind: "announcement_published",
      title: "Duyuru",
      body: "Gövde",
      dedupeKey: "ann-1:announcement_published",
    };
    await createNotification(input);
    const second = await createNotification(input);
    expect(second.status).toBe("duplicate");
    expect(calls).toBe(1);
  });

  it("skipPush veren çağıranda köprü SUSAR (ders sweep'i kendi push'unu yönetir)", async () => {
    await seedPushEnabled("lesson_reminder_1h", "android");
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return okResponse();
    });
    await createNotification({
      tenantId: TENANT,
      targetUserId: USER,
      kind: "lesson_reminder_1h",
      title: "Ders hatırlatması",
      body: "15 dakika kaldı",
      skipPush: true,
    });
    expect(calls).toBe(0);
  });

  it("altyapı kapalıyken (PUSH_ENABLED yok) HTTP çağrısı YOK — mevcut davranış korunur", async () => {
    await seedPushEnabled("announcement_published", "android");
    delete process.env.PUSH_ENABLED;
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return okResponse();
    });
    const res = await createNotification({
      tenantId: TENANT,
      targetUserId: USER,
      kind: "announcement_published",
      title: "Duyuru",
      body: "Gövde",
    });
    expect(res.status).toBe("created");
    expect(calls).toBe(0);
  });

  it("DeviceNotRegistered → token devre dışı (bir sonraki gönderimde hedef kalmaz)", async () => {
    await seedPushEnabled("announcement_published", "android");
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }), {
        status: 200,
      })
    );
    await createNotification({
      tenantId: TENANT,
      targetUserId: USER,
      kind: "announcement_published",
      title: "Duyuru",
      body: "Gövde",
    });
    expect(await listEnabledDevicePushTokens(TENANT, USER)).toHaveLength(0);
  });
});
