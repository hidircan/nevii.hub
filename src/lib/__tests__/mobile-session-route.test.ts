import { describe, it, expect, beforeEach } from "vitest";
import { DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD, DEFAULT_TENANT_ID } from "../auth/config";
import { grantStudentAccess } from "./portal-access-test-helper";

/**
 * Mobil P0 — `GET /api/v1/mobile/session` persona girdileri (gerçek login +
 * JWT, authenticate mock'u yok) ve mobil (çerezsiz) logout'un sunucu
 * oturumunu `body.refreshToken` ile kapatması.
 */
const { POST: loginPost } = await import("../../app/api/v1/auth/login/route");
const { POST: logoutPost } = await import("../../app/api/v1/auth/logout/route");
const { GET: sessionGet } = await import("../../app/api/v1/mobile/session/route");
const { __resetRateLimitForTests } = await import("../rate-limit");

type Session = {
  userId: string;
  role: string;
  loginRole: string;
  tenantId: string;
  teacherId?: string;
  studentId?: string;
  portalAccessType: "SELF" | "GUARDIAN" | null;
};

async function login(email: string, password: string) {
  const res = await loginPost(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
  const json = (await res.json()) as { ok: boolean; data: { accessToken: string; refreshToken: string } };
  expect(json.ok, `login ${email}`).toBe(true);
  return json.data;
}

async function session(accessToken: string) {
  const res = await sessionGet(
    new Request("http://localhost/api/v1/mobile/session", { headers: { authorization: `Bearer ${accessToken}` } })
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; data: Session } };
}

describe("GET /api/v1/mobile/session", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("TEACHER: teacherId sunucudan, portalAccessType null", async () => {
    const { accessToken } = await login("turgay.hosbas@niluferacar.com.tr", "demo-teacher-csv-1");
    const { status, body } = await session(accessToken);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ role: "TEACHER", loginRole: "TEACHER", teacherId: "t1", tenantId: DEFAULT_TENANT_ID, portalAccessType: null });
  });

  it("BRANCH_MANAGER (unified kurum): efektif SCHOOL_ADMIN + loginRole BRANCH_MANAGER, 403 DEĞİL", async () => {
    const { accessToken } = await login("nihal.gedikli@niluferacar.com.tr", "demo-manager-nihal");
    const { status, body } = await session(accessToken);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ role: "SCHOOL_ADMIN", loginRole: "BRANCH_MANAGER" });
  });

  it("HYPER_ADMIN: rolü olduğu gibi döner (mobil fail-closed karar verir)", async () => {
    const { accessToken } = await login(DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD);
    const { body } = await session(accessToken);
    expect(body.data).toMatchObject({ role: "HYPER_ADMIN", loginRole: "HYPER_ADMIN", portalAccessType: null });
  });

  it("STUDENT: portalAccessType kanonik kaynaktan (getActiveAccessType); veli → GUARDIAN", async () => {
    // Paylaşımlı json test store'u başka testlerin erişim kayıtlarını taşıyabilir —
    // beklenen değer sabit değil, sunucunun tek doğruluk kaynağından okunur.
    const { getActiveAccessType } = await import("../student-portal-access");
    const expected = await getActiveAccessType(DEFAULT_TENANT_ID, "user_student_s1", "s1");
    expect(expected).not.toBeNull();
    const self = await login("ogrenci@email.com", "demo-student");
    expect((await session(self.accessToken)).body.data).toMatchObject({ role: "STUDENT", studentId: "s1", portalAccessType: expected });

    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "user_parent_s1" }, "s1", "GUARDIAN");
    const parent = await login("selin@email.com", "demo-parent");
    expect((await session(parent.accessToken)).body.data).toMatchObject({ role: "STUDENT", studentId: "s1", portalAccessType: "GUARDIAN" });
  });

  it("token yoksa 401", async () => {
    const res = await sessionGet(new Request("http://localhost/api/v1/mobile/session"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout — mobil body.refreshToken", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("çerezsiz, gövdedeki refresh token ile sunucu oturumunu kapatır; eski access token 401 olur", async () => {
    const { accessToken, refreshToken } = await login("turgay.hosbas@niluferacar.com.tr", "demo-teacher-csv-1");
    expect((await session(accessToken)).status).toBe(200);

    const out = await logoutPost(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
    );
    expect(out.status).toBe(200);
    expect((await session(accessToken)).status).toBe(401);
  });

  it("geçersiz gövde token'ı hata fırlatmaz (200, kapatılacak oturum yok)", async () => {
    const out = await logoutPost(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: "not-a-jwt" }),
      })
    );
    expect(out.status).toBe(200);
  });
});
