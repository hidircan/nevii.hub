import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { disableDevicePushTokens, listEnabledDevicePushTokens } from "../device-push-tokens";

/**
 * POST/DELETE /api/v1/mobile/push-tokens — owner/tenant izolasyonu,
 * validation, token sızıntısı yok. Ham token yanıtta/logda ASLA dönmez.
 */
const { POST: loginPost } = await import("../../app/api/v1/auth/login/route");
const { POST: registerPost, DELETE: unregisterDelete } = await import(
  "../../app/api/v1/mobile/push-tokens/route"
);
const { __resetRateLimitForTests } = await import("../rate-limit");

const TOKEN_A = "ExponentPushToken[test-device-aaa111]";
const TOKEN_B = "ExponentPushToken[test-device-bbb222]";

async function login(email: string, password: string) {
  const res = await loginPost(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
  const json = (await res.json()) as { ok: boolean; data: { accessToken: string } };
  expect(json.ok, `login ${email}`).toBe(true);
  return json.data.accessToken;
}

function authed(token: string | undefined, method: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/v1/mobile/push-tokens", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("push token API", () => {
  beforeEach(async () => {
    __resetRateLimitForTests();
    await disableDevicePushTokens(DEFAULT_TENANT_ID, "user_parent_s1");
    await disableDevicePushTokens(DEFAULT_TENANT_ID, "user_teacher_t1");
  });

  it("veli token kaydeder; yanıt ham token içermez", async () => {
    const token = await login("selin@email.com", "demo-parent");
    const res = await registerPost(authed(token, "POST", { expoPushToken: TOKEN_A, platform: "ios" }));
    const body = (await res.json()) as { ok: boolean; data: { registered: boolean; tokenId: string; enabled: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.registered).toBe(true);
    expect(JSON.stringify(body)).not.toContain("ExponentPushToken[test-device");
    expect(await listEnabledDevicePushTokens(DEFAULT_TENANT_ID, "user_parent_s1")).toHaveLength(1);
    await disableDevicePushTokens(DEFAULT_TENANT_ID, "user_parent_s1");
  });

  it("öğretmen kendi token'ını kaydeder; başkası devre dışı bırakamaz", async () => {
    const parent = await login("selin@email.com", "demo-parent");
    await registerPost(authed(parent, "POST", { expoPushToken: TOKEN_A, platform: "ios" }));
    const teacher = await login("turgay.hosbas@niluferacar.com.tr", "demo-teacher-csv-1");
    // Öğretmen, velinin token'ını hedefleyerek DELETE çağırır — kendi
    // kapsamında eşleşme olmadığı için etkisi 0 olur, veli token'ı yaşar.
    const del = await unregisterDelete(authed(teacher, "DELETE", { expoPushToken: TOKEN_A }));
    const delBody = (await del.json()) as { ok: boolean; data: { disabled: number } };
    expect(delBody.data.disabled).toBe(0);
    expect(await listEnabledDevicePushTokens(DEFAULT_TENANT_ID, "user_parent_s1")).toHaveLength(1);
    await disableDevicePushTokens(DEFAULT_TENANT_ID, "user_parent_s1");
  });

  it("geçersiz token biçimi 400; auth yoksa 401", async () => {
    const token = await login("selin@email.com", "demo-parent");
    const bad = await registerPost(authed(token, "POST", { expoPushToken: "fcm:raw-token", platform: "android" }));
    expect(bad.status).toBe(400);
    const anon = await registerPost(authed(undefined, "POST", { expoPushToken: TOKEN_B, platform: "android" }));
    expect(anon.status).toBe(401);
  });

  it("logout tüm cihazları devre dışı bırakır", async () => {
    const token = await login("selin@email.com", "demo-parent");
    await registerPost(authed(token, "POST", { expoPushToken: TOKEN_A, platform: "ios" }));
    await registerPost(authed(token, "POST", { expoPushToken: TOKEN_B, platform: "android" }));
    const del = await unregisterDelete(authed(token, "DELETE", {}));
    const body = (await del.json()) as { ok: boolean; data: { disabled: number } };
    expect(body.data.disabled).toBe(2);
    expect(await listEnabledDevicePushTokens(DEFAULT_TENANT_ID, "user_parent_s1")).toHaveLength(0);
  });
});
