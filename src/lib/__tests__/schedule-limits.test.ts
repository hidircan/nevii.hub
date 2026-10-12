import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { getStudentScheduleTool, getTeacherScheduleTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { __resetServerCache } from "../http/server-cache";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  __resetServerCache();
});

describe("program uçları — payload sınırları", () => {
  it("öğrenci programı total + truncated taşır, varsayılan sınır uygulanır", async () => {
    const res = await getStudentScheduleTool(ctx(), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(typeof res.data.total).toBe("number");
    expect(typeof res.data.truncated).toBe("boolean");
    expect(res.data.lessons.length).toBeLessThanOrEqual(500);
    expect(res.data.truncated).toBe(res.data.total > res.data.lessons.length);
  });

  it("limit parametresi saygındır, üst sınır aşılamaz", async () => {
    const small = await getStudentScheduleTool(ctx(), { studentId: "s1", limit: 1 });
    expect(small.ok).toBe(true);
    if (!small.ok) return;
    expect(small.data.lessons.length).toBeLessThanOrEqual(1);

    const huge = await getStudentScheduleTool(ctx(), { studentId: "s1", limit: 999999 });
    expect(huge.ok).toBe(false);
    if (huge.ok) return;
    expect(huge.error.code).toBe("VALIDATION_ERROR");
  });

  it("öğretmen programı from/to + limit destekler", async () => {
    const tctx = ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" });
    const res = await getTeacherScheduleTool(tctx, { teacherId: "t1", limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lessons.length).toBeLessThanOrEqual(10);
    expect(typeof res.data.total).toBe("number");
    expect(typeof res.data.truncated).toBe("boolean");

    const windowed = await getTeacherScheduleTool(tctx, {
      teacherId: "t1",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-08T00:00:00.000Z",
    });
    expect(windowed.ok).toBe(true);
  });

  it("yetki değişmedi: yabancı öğretmen programı hâlâ 403", async () => {
    const res = await getTeacherScheduleTool(ctx({ role: "TEACHER", userId: "u-t9", teacherId: "t9" }), { teacherId: "t1" });
    expect(res.ok).toBe(false);
  });
});
