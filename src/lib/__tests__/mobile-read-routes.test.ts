import { describe, it, expect, beforeEach } from "vitest";
import { DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD } from "../auth/config";

/**
 * Mobil P0 route'ları — gerçek login + JWT ile auth/tenant/rol kapıları
 * (kapsam ayrıntısı mobile-read-tools.test.ts'te).
 */
const { POST: loginPost } = await import("../../app/api/v1/auth/login/route");
const makeupRoute = await import("../../app/api/v1/makeup/route");
const receiptRoute = await import("../../app/api/v1/payments/[paymentId]/receipt/route");
const { __resetRateLimitForTests } = await import("../rate-limit");

async function token(email: string, password: string) {
  const res = await loginPost(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
  const json = (await res.json()) as { ok: boolean; data: { accessToken: string } };
  expect(json.ok, email).toBe(true);
  return json.data.accessToken;
}

const get = (url: string, accessToken?: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { headers: { ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...headers } });

const teacher = () => token("turgay.hosbas@niluferacar.com.tr", "demo-teacher-csv-1");

describe("GET /api/v1/makeup", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("oturum yoksa 401", async () => {
    expect((await makeupRoute.GET(get("/api/v1/makeup"))).status).toBe(401);
  });

  it("öğretmen 200 ve yalnız kendi (t1) kayıtları", async () => {
    const res = await makeupRoute.GET(get("/api/v1/makeup", await teacher()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { makeupRequests: Array<{ teacherId: string }> } };
    expect(body.data.makeupRequests.every((m) => m.teacherId === "t1")).toBe(true);
  });

  it("istemci X-Tenant-Id ile başka tenant seçemez (401)", async () => {
    const res = await makeupRoute.GET(get("/api/v1/makeup", await teacher(), { "x-tenant-id": "tenant_baska" }));
    expect(res.status).toBe(401);
  });

  it("BRANCH_MANAGER ve HYPER_ADMIN fail-closed (403)", async () => {
    const bm = await token("nihal.gedikli@niluferacar.com.tr", "demo-manager-nihal");
    expect((await makeupRoute.GET(get("/api/v1/makeup", bm))).status).toBe(403);
    const hyper = await token(DEV_HYPER_ADMIN_EMAIL, DEV_HYPER_ADMIN_PASSWORD);
    expect((await makeupRoute.GET(get("/api/v1/makeup", hyper))).status).toBe(403);
  });
});

describe("GET /api/v1/payments/:paymentId/receipt", () => {
  beforeEach(() => __resetRateLimitForTests());
  const call = (id: string, t?: string) => receiptRoute.GET(get(`/api/v1/payments/${id}/receipt`, t), { params: { paymentId: id } });

  it("oturum yoksa 401", async () => {
    expect((await call("p_any")).status).toBe(401);
  });

  it("öğretmen başkasının ödeme makbuzunu göremez (403)", async () => {
    expect((await call("p_any", await teacher())).status).toBe(403);
  });

  it("öğrenci için bilinmeyen ödeme 404", async () => {
    const student = await token("ogrenci@email.com", "demo-student");
    expect((await call("p_bu_id_yok", student)).status).toBe(404);
  });
});

describe("salt-okunur route yüzeyi", () => {
  it.each([
    ["makeup", makeupRoute],
    ["receipt", receiptRoute],
  ])("%s yalnız GET export eder", (_name, mod) => {
    expect(Object.keys(mod).filter((k) => ["POST", "PUT", "PATCH", "DELETE"].includes(k))).toEqual([]);
    expect(typeof (mod as { GET?: unknown }).GET).toBe("function");
  });
});
