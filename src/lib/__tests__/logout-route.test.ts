import { describe, it, expect } from "vitest";
import { signToken } from "../auth/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../auth/cookies";
import { POST as logoutPost } from "../../app/api/v1/auth/logout/route";
import type { AuthUser } from "../auth/types";

const APP_URL = "https://app.example.test";

function user(): AuthUser {
  return { userId: "u1", role: "SCHOOL_ADMIN", tenantId: "t1" };
}

/**
 * FAZ7 — "Çıkış yap" gerçek logout endpoint'i çağırır; bu testler o
 * endpoint'in gerçekten cookie temizlediğini ve fail-closed CSRF davranışını
 * doğrular (client tarafındaki fix ise: res.ok kontrol etmeden önce
 * unconditional /login'e yönlendirmiyor artık — bkz. user-menu.tsx).
 */
describe("POST /api/v1/auth/logout", () => {
  it("aynı origin'den, geçerli cookie ile çağrıldığında access+refresh cookie'lerini temizler", async () => {
    const token = await signToken(user(), "access");
    const req = new Request(`${APP_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        cookie: `${ACCESS_COOKIE}=${token}; ${REFRESH_COOKIE}=irrelevant`,
        origin: APP_URL,
      },
    });
    const res = await logoutPost(req);
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    const joined = setCookies.join("\n");
    expect(joined).toMatch(/np_access=;.*Max-Age=0/);
    expect(joined).toMatch(/np_refresh=;.*Max-Age=0/);
    expect(joined).toMatch(/HttpOnly/i);
    expect(joined).toMatch(/SameSite=lax/i);
    expect(joined).toMatch(/Path=\//);
  });

  it("farklı origin'den cookie'li logout isteği CSRF guard tarafından reddedilir (cookie temizlenmez)", async () => {
    const token = await signToken(user(), "access");
    const req = new Request(`${APP_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        cookie: `${ACCESS_COOKIE}=${token}`,
        origin: "https://evil.test",
      },
    });
    const res = await logoutPost(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("cookie hiç yoksa (Bearer/mobil çağrısı gibi) CSRF kontrolüne takılmadan 200 döner", async () => {
    const req = new Request(`${APP_URL}/api/v1/auth/logout`, {
      method: "POST",
    });
    const res = await logoutPost(req);
    expect(res.status).toBe(200);
  });
});
