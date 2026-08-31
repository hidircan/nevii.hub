/**
 * Kimliği doğrulanmış "şifre değiştir" — Paket 2 uzlaşması. Mobil
 * (`apps/mobile/src/features/account/change-password-screen.tsx`) her zaman
 * `/api/v1/auth/change-password`'ü çağırıyordu ama bu route main'de hiç YOKTU
 * (404). Web `/api/v1/account/change-password`'ü kullanıyor. İkisi de AYNI
 * kanonik `changeOwnPassword` (bkz. src/lib/auth/users.ts) uygulamasının
 * ince sarmalayıcısı — parola güncelleme mantığı tek yerde.
 *
 * Ayrıca `changeOwnPassword` artık json/memory modunda da çalışıyor
 * (öncesinde yalnızca STORE_MODE=db'de çalışırdı, json/memory'de her zaman
 * MODE_NOT_SUPPORTED dönerdi — bu proje her zaman STORE_MODE=json ile test
 * çalıştırdığından, bu genişletme olmadan ne bu testler ne de mobildeki
 * gerçek akış doğrulanabilirdi).
 */
import { describe, it, expect } from "vitest";
import { authenticateUser, changeOwnPassword } from "../auth/users";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { issueTokenPair } from "../auth/jwt";
import type { AuthUser } from "../auth/types";
import { POST as changePasswordMobile } from "../../app/api/v1/auth/change-password/route";
import { POST as changePasswordWeb } from "../../app/api/v1/account/change-password/route";

const EMAIL = "turgay.hosbas@niluferacar.com.tr";
const ORIGINAL_PASSWORD = "demo-teacher-csv-1";
const USER_ID = "user_teacher_t1";

async function bearer(user: AuthUser): Promise<string> {
  const { accessToken } = await issueTokenPair(user);
  return `Bearer ${accessToken}`;
}

function req(auth: string, body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(body),
  });
}

describe("changeOwnPassword — mode parity (json/memory'de artık gerçekten çalışır)", () => {
  it("yanlış mevcut şifreyle reddedilir", async () => {
    const res = await changeOwnPassword(USER_ID, "wrong-current-password", "brand-new-pass-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_PASSWORD");
  });

  it("çok kısa yeni şifre reddedilir", async () => {
    const res = await changeOwnPassword(USER_ID, ORIGINAL_PASSWORD, "short");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WEAK_PASSWORD");
  });

  it("doğru mevcut şifreyle değiştirir; eski şifre artık çalışmaz, yenisi çalışır", async () => {
    const res = await changeOwnPassword(USER_ID, ORIGINAL_PASSWORD, "brand-new-pass-1");
    expect(res.ok).toBe(true);

    const withOld = await authenticateUser(EMAIL, ORIGINAL_PASSWORD);
    expect(withOld).toBeNull();
    const withNew = await authenticateUser(EMAIL, "brand-new-pass-1");
    expect(withNew).not.toBeNull();
    expect(withNew?.teacherId).toBe("t1");

    // Restore so this test file doesn't leave permanent cross-test state (shared json store, fileParallelism:false).
    const restore = await changeOwnPassword(USER_ID, "brand-new-pass-1", ORIGINAL_PASSWORD);
    expect(restore.ok).toBe(true);
  });
});

describe("POST /api/v1/auth/change-password — mobilin çağırdığı route (kök neden P0-404 giderme)", () => {
  it("route artık 404 DEĞİL — kimlik doğrulanmış geçerli istekte 200 JSON döner", async () => {
    const auth = await bearer({ userId: USER_ID, role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await changePasswordMobile(req(auth, { currentPassword: ORIGINAL_PASSWORD, newPassword: "mobile-new-pass-1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.ok).toBe(true);

    const withOld = await authenticateUser(EMAIL, ORIGINAL_PASSWORD);
    expect(withOld).toBeNull();
    const withNew = await authenticateUser(EMAIL, "mobile-new-pass-1");
    expect(withNew).not.toBeNull();

    // Restore
    const restoreAuth = await bearer({ userId: USER_ID, role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const restore = await changePasswordMobile(req(restoreAuth, { currentPassword: "mobile-new-pass-1", newPassword: ORIGINAL_PASSWORD }));
    expect((await restore.json()).ok).toBe(true);
  });

  it("yanlış mevcut şifre güvenli/jenerik bir hatayla başarısız olur (iç detay sızdırmaz)", async () => {
    const auth = await bearer({ userId: USER_ID, role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await changePasswordMobile(req(auth, { currentPassword: "totally-wrong", newPassword: "irrelevant-1" }));
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("Mevcut şifre yanlış.");
  });

  it("token yoksa 401 döner", async () => {
    const res = await changePasswordMobile(
      new Request("http://localhost/api/v1/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "x", newPassword: "irrelevant-1" }),
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/account/change-password — web route AYNI kanonik implementasyonu kullanmaya devam eder (tek yazma yolu doğrulaması)", () => {
  it("mobil route ile DEĞİŞTİRİLEN şifre web route'undan da doğrulanabilir (ikisi aynı store'u okur/yazar)", async () => {
    const authMobile = await bearer({ userId: USER_ID, role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const changed = await changePasswordMobile(req(authMobile, { currentPassword: ORIGINAL_PASSWORD, newPassword: "cross-route-pass-1" }));
    expect((await changed.json()).ok).toBe(true);

    const authWeb = await bearer({ userId: USER_ID, role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const webReq = new Request("http://localhost/api/v1/account/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authWeb },
      body: JSON.stringify({ currentPassword: "cross-route-pass-1", newPassword: ORIGINAL_PASSWORD }),
    });
    const restored = await changePasswordWeb(webReq);
    const restoredJson = await restored.json();
    expect(restoredJson.ok).toBe(true);

    const withOriginal = await authenticateUser(EMAIL, ORIGINAL_PASSWORD);
    expect(withOriginal).not.toBeNull();
  });
});
