/**
 * GET /api/v1/students/:studentId/attendance-summary — mobil Gelişim ekranındaki
 * "Ders devam özeti" bölümünün eksik route'u (önceden hiç yoktu → ham Next.js
 * HTML 404, örn. öğrenci Nehir Kaya). Erişim/route wiring testi — aynı desen
 * student-score-route.test.ts ile (gerçek HTTP katmanı, Bearer JWT + route
 * handler'ın kendisi); sayım mantığı effectiveLessonOpsStatus'a devredilir.
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
import { GET as getAttendanceSummary } from "../../app/api/v1/students/[studentId]/attendance-summary/route";

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

describe("GET /api/v1/students/:studentId/attendance-summary — kök neden P0-404 giderme (ders devam özeti)", () => {
  it("öğretmen kendi öğrencisinin devam özetini görebilir (önceden route hiç yoktu)", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await getAttendanceSummary(req("/api/v1/students/s1/attendance-summary", { auth }), { params: { studentId: "s1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Mobil `AttendanceSummary` tipiyle (apps/mobile/src/types/api.ts) birebir eşleşen alanlar.
    expect(json.data).toMatchObject({ studentId: "s1" });
    for (const key of ["totalLessons", "attended", "absent", "excused", "makeup", "pending"] as const) {
      expect(typeof json.data[key]).toBe("number");
    }
    expect(json.data.attended + json.data.absent + json.data.excused + json.data.makeup + json.data.pending).toBe(
      json.data.totalLessons
    );
  });

  it("başka bir öğretmen bu özeti alamaz (FORBIDDEN, bilgi sızdırmaz)", async () => {
    const auth = await bearer({ userId: "u-t2", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t2" });
    const res = await getAttendanceSummary(req("/api/v1/students/s1/attendance-summary", { auth }), { params: { studentId: "s1" } });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("admin herhangi bir öğrencinin devam özetini görebilir", async () => {
    const auth = await bearer({ userId: "u-admin", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const res = await getAttendanceSummary(req("/api/v1/students/s1/attendance-summary", { auth }), { params: { studentId: "s1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("var olmayan bir öğrenci JSON NOT_FOUND döner (route-level HTML 404 DEĞİL)", async () => {
    const auth = await bearer({ userId: "u-admin", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const res = await getAttendanceSummary(req("/api/v1/students/does-not-exist/attendance-summary", { auth }), {
      params: { studentId: "does-not-exist" },
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("kimliği doğrulanmamış istek 401 döner", async () => {
    const res = await getAttendanceSummary(req("/api/v1/students/s1/attendance-summary"), { params: { studentId: "s1" } });
    expect(res.status).toBe(401);
  });
});
