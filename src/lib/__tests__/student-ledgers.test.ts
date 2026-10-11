import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Öğrenci ledger route'ları (attendance/makeup/payment + export) — gerçek
 * login + JWT ile auth/tenant/student-scope kapıları ve yanıt şekli.
 * Negatif: 401 (oturumsuz), 403 (erişimsiz öğrenci / izinsiz rol),
 * 404 (bilinmeyen öğrenci). Finans matematiği balance ile AYNI kalır.
 */
const { POST: loginPost } = await import("../../app/api/v1/auth/login/route");
const attendanceRoute = await import("../../app/api/v1/students/[studentId]/attendance-ledger/route");
const makeupRoute = await import("../../app/api/v1/students/[studentId]/makeup-ledger/route");
const paymentRoute = await import("../../app/api/v1/students/[studentId]/payment-ledger/route");
const exportRoute = await import("../../app/api/v1/students/[studentId]/payment-ledger/export/route");
const pushTestRoute = await import("../../app/api/v1/mobile/push-test/route");
const { __resetRateLimitForTests } = await import("../rate-limit");

const tokenCache = new Map<string, string>();
async function token(email: string, password: string) {
  const hit = tokenCache.get(email);
  if (hit) return hit;
  __resetRateLimitForTests("auth-login-ip");
  __resetRateLimitForTests("auth-login-ip-email");
  const res = await loginPost(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
  const json = (await res.json()) as { ok: boolean; data: { accessToken: string } };
  expect(json.ok, email).toBe(true);
  tokenCache.set(email, json.data.accessToken);
  return json.data.accessToken;
}

const parent = () => token("selin@email.com", "demo-parent");
const student = () => token("ogrenci@email.com", "demo-student");
const teacher = () => token("turgay.hosbas@niluferacar.com.tr", "demo-teacher-csv-1");

const get = (url: string, accessToken?: string) =>
  new Request(`http://localhost${url}`, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });

const params = (studentId: string) => ({ params: { studentId } });

describe("GET attendance-ledger", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("oturum yoksa 401", async () => {
    expect((await attendanceRoute.GET(get("/x"), params("s1"))).status).toBe(401);
  });

  it("veli erişimli öğrencide 200 + defter şekli", async () => {
    const res = await attendanceRoute.GET(get("/x?sort=asc&limit=50", await parent()), params("s1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { studentId: string; total: number; counts: Record<string, number>; items: Array<Record<string, unknown>> };
    };
    expect(body.data.studentId).toBe("s1");
    expect(typeof body.data.total).toBe("number");
    expect(Object.keys(body.data.counts)).toContain("upcoming");
    const first = body.data.items[0];
    if (first) {
      for (const k of ["lessonId", "startAt", "endAt", "teacherName", "displayKey", "lessonStatus"]) {
        expect(first, k).toHaveProperty(k);
      }
    }
  });

  it("veli erişimsiz öğrencide 403, bilinmeyende 404", async () => {
    const t = await parent();
    expect((await attendanceRoute.GET(get("/x", t), params("s_csv_1"))).status).toBe(403);
    expect((await attendanceRoute.GET(get("/x", t), params("s_yok"))).status).toBe(404);
  });

  it("öğretmen kendi öğrencisinde 200, başkasında 403", async () => {
    const t = await teacher();
    expect((await attendanceRoute.GET(get("/x", t), params("s1"))).status).toBe(200);
    expect((await attendanceRoute.GET(get("/x", t), params("s_csv_2"))).status).toBe(403);
  });

  it("öğrenci yüzeyine operasyon notu sızmaz", async () => {
    const res = await attendanceRoute.GET(get("/x?limit=200", await student()), params("s1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: Array<{ statusNote: string | null }> } };
    expect(body.data.items.every((i) => i.statusNote === null)).toBe(true);
  });

  it("status filtresi daraltır", async () => {
    const t = await parent();
    const all = (await (await attendanceRoute.GET(get("/x?limit=200", t), params("s1"))).json()) as {
      data: { total: number };
    };
    const res = await attendanceRoute.GET(get("/x?status=upcoming&limit=200", t), params("s1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { total: number; items: Array<{ displayKey: string }> } };
    expect(body.data.items.every((i) => i.displayKey === "upcoming")).toBe(true);
    expect(body.data.total).toBeLessThanOrEqual(all.data.total);
  });
});

describe("GET makeup-ledger", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("oturum yoksa 401", async () => {
    expect((await makeupRoute.GET(get("/x"), params("s1"))).status).toBe(401);
  });

  it("veli erişimli öğrencide 200 + zenginleştirme şekli", async () => {
    const res = await makeupRoute.GET(get("/x", await parent()), params("s1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { studentId: string; total: number; items: unknown[] } };
    expect(body.data.studentId).toBe("s1");
    expect(typeof body.data.total).toBe("number");
  });

  it("veli erişimsiz öğrencide 403", async () => {
    expect((await makeupRoute.GET(get("/x", await parent()), params("s_csv_1"))).status).toBe(403);
  });

  it("öğretmen kendi öğrencisinde 200, başkasında 403", async () => {
    const t = await teacher();
    expect((await makeupRoute.GET(get("/x", t), params("s1"))).status).toBe(200);
    expect((await makeupRoute.GET(get("/x", t), params("s_csv_2"))).status).toBe(403);
  });
});

describe("GET payment-ledger + export", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("oturum yoksa 401", async () => {
    expect((await paymentRoute.GET(get("/x"), params("s1"))).status).toBe(401);
    expect((await exportRoute.GET(get("/x"), params("s1"))).status).toBe(401);
  });

  it("veli 200 + ay özetleri + onlinePayEnabled bayrağı", async () => {
    const res = await paymentRoute.GET(get("/x", await parent()), params("s1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        studentId: string;
        outstanding: number;
        onlinePayEnabled: boolean;
        months: Array<{ month: string; accrued: number; paid: number; remaining: number; status: string }>;
        total: number;
      };
    };
    expect(body.data.studentId).toBe("s1");
    expect(typeof body.data.outstanding).toBe("number");
    expect(typeof body.data.onlinePayEnabled).toBe("boolean");
    expect(Array.isArray(body.data.months)).toBe(true);
  });

  it("ödenmemiş toplam balance ile aynı matematikte", async () => {
    const balanceRoute = await import("../../app/api/v1/students/[studentId]/balance/route");
    const t = await parent();
    const a = (await (await paymentRoute.GET(get("/x", t), params("s1"))).json()) as { data: { outstanding: number } };
    const b = (await (await balanceRoute.GET(get("/x", t), params("s1"))).json()) as { data: { outstanding: number } };
    expect(a.data.outstanding).toBe(b.data.outstanding);
  });

  it("veli erişimsiz öğrencide 403 (ledger + export)", async () => {
    const t = await parent();
    expect((await paymentRoute.GET(get("/x", t), params("s_csv_1"))).status).toBe(403);
    expect((await exportRoute.GET(get("/x", t), params("s_csv_1"))).status).toBe(403);
  });

  it("öğretmen payment-ledger göremez (403, balance ile aynı kapı)", async () => {
    expect((await paymentRoute.GET(get("/x", await teacher()), params("s1"))).status).toBe(403);
  });

  it("export CSV indirir (attachment, no-store)", async () => {
    const res = await exportRoute.GET(get("/x", await parent()), params("s1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const text = await res.text();
    expect(text).toContain("Tutar (TL)");
  });
});

describe("POST mobile/push-test", () => {
  beforeEach(() => __resetRateLimitForTests());

  it("oturum yoksa 401", async () => {
    const res = await pushTestRoute.POST(new Request("http://localhost/x", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("production'da rota gizli (404, auth öncesi)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await pushTestRoute.POST(new Request("http://localhost/x", { method: "POST" }));
      expect(res.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
