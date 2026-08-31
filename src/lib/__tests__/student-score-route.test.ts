/**
 * GET /api/v1/students/:studentId/score — mobil öğrenci detay ekranındaki
 * "Genel gelişim skoru" bölümünün eksik route'u (önceden 404 + non-JSON body).
 * Erişim/route wiring testi — skor hesaplama mantığı zaten student-score.test.ts'te
 * kapsamlı test ediliyor (bkz. mobile-baseline-endpoints.test.ts ile AYNI desen:
 * gerçek HTTP katmanı, Bearer JWT + route handler'ın kendisi).
 *
 * Seed: s1.teacherId === t1, t2 farklı bir öğretmen (s1'e sahip DEĞİL).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { issueTokenPair } from "../auth/jwt";
import type { AuthUser } from "../auth/types";
import { GET as getStudentScore } from "../../app/api/v1/students/[studentId]/score/route";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

async function bearer(user: AuthUser): Promise<string> {
  const { accessToken } = await issueTokenPair(user);
  return `Bearer ${accessToken}`;
}

function req(url: string, opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = opts.auth;
  return new Request(`http://localhost${url}`, { method: "GET", headers });
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("GET /api/v1/students/:studentId/score — kök neden P0-404 giderme (genel gelişim skoru)", () => {
  it("öğretmen kendi öğrencisinin skorunu görebilir (önceden 404 + non-JSON veriyordu)", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await getStudentScore(req("/api/v1/students/s1/score", { auth }), { params: { studentId: "s1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Mobil `StudentScoreResponse` tipiyle (apps/mobile/src/types/api.ts) birebir eşleşen alanlar.
    expect(json.data).toHaveProperty("score");
    expect(json.data).toHaveProperty("periodStart");
    expect(json.data).toHaveProperty("periodEnd");
    expect(json.data.components).toHaveProperty("attendance");
    expect(json.data.components).toHaveProperty("homework");
    expect(json.data.components).toHaveProperty("curriculum");
    expect(json.data.components).toHaveProperty("teacherAssessment");
    for (const key of ["attendance", "homework", "curriculum", "teacherAssessment"] as const) {
      const c = json.data.components[key];
      expect(c).toHaveProperty("weight");
      expect(c).toHaveProperty("hasData");
      expect(c).toHaveProperty("normalizedValue");
      expect(c).toHaveProperty("contribution");
    }
  });

  it("başka bir öğretmen bu skoru alamaz (FORBIDDEN, bilgi sızdırmaz)", async () => {
    const auth = await bearer({ userId: "u-t2", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t2" });
    const res = await getStudentScore(req("/api/v1/students/s1/score", { auth }), { params: { studentId: "s1" } });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("admin herhangi bir öğrencinin skorunu görebilir", async () => {
    const auth = await bearer({ userId: "u-admin", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const res = await getStudentScore(req("/api/v1/students/s1/score", { auth }), { params: { studentId: "s1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("var olmayan bir öğrenci JSON NOT_FOUND döner (route-level HTML 404 DEĞİL)", async () => {
    const auth = await bearer({ userId: "u-admin", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const res = await getStudentScore(req("/api/v1/students/does-not-exist/score", { auth }), {
      params: { studentId: "does-not-exist" },
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("kimliği doğrulanmamış istek 401 döner", async () => {
    const res = await getStudentScore(req("/api/v1/students/s1/score"), { params: { studentId: "s1" } });
    expect(res.status).toBe(401);
  });
});
