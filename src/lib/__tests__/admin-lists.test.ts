import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { listStudentsTool, listTeachersTool, listBranchesTool, listRoomsTool, listLessonsTool, getCollectionSummaryTool } from "../services/admin-lists";
import {
  cancelLessonTool,
  createLessonTool,
  getStudentPortalAccessTool,
  reactivateStudentPortalAccessTool,
  revokeStudentPortalAccessTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";
import { findOpenLessonSlot } from "./helpers/lesson-slot";
import { readData } from "../store";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("listStudentsTool — admin P0 (Kişiler/Yoklama)", () => {
  it("admin tüm öğrencileri görür (deterministik sıra)", async () => {
    const res = await listStudentsTool(ctx(), { limit: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.total).toBeGreaterThanOrEqual(2);
    expect(res.data.students.map((s) => s.id)).toContain("s1");
    const names = res.data.students.map((s) => s.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "tr"))).toEqual(names);
  });

  it("q araması ad + veli adında sunucu tarafında filtreler", async () => {
    const byName = await listStudentsTool(ctx(), { q: "zeynep" });
    expect(byName.ok && byName.data.students.map((s) => s.id)).toEqual(["s1"]);
    const byParent = await listStudentsTool(ctx(), { q: "hakan çelik" });
    expect(byParent.ok && byParent.data.students.map((s) => s.id)).toEqual(["s2"]);
  });

  it("limit/offset pagination + total", async () => {
    const p1 = await listStudentsTool(ctx(), { limit: 1, offset: 0 });
    const p2 = await listStudentsTool(ctx(), { limit: 1, offset: 1 });
    expect(p1.ok && p1.data.students.length).toBe(1);
    expect(p2.ok && p2.data.students.length).toBe(1);
    if (p1.ok && p2.ok) {
      expect(p1.data.total).toBe(p2.data.total);
      expect(p1.data.students[0]!.id).not.toBe(p2.data.students[0]!.id);
    }
  });

  it("limit üst sınırı aşılamaz (maks 100)", async () => {
    const res = await listStudentsTool(ctx(), { limit: 500 });
    expect(res.ok).toBe(false);
  });

  it("TEACHER yalnız kendi öğrencilerini görür", async () => {
    const res = await listStudentsTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t1" }), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.students.length).toBeGreaterThan(0);
    expect(res.data.students.every((s) => s.teacherId === "t1")).toBe(true);
  });

  it("STUDENT/BRANCH_MANAGER fail-closed", async () => {
    expect((await listStudentsTool(ctx({ role: "STUDENT", userId: "u_s" }), {})).ok).toBe(false);
    expect((await listStudentsTool(ctx({ role: "BRANCH_MANAGER", userId: "u_b" }), {})).ok).toBe(false);
  });
});

describe("listTeachersTool — admin P0 + öğretmen öz-kaydı", () => {
  it("admin öğretmenleri performans özetiyle görür", async () => {
    const res = await listTeachersTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.teachers.length).toBeGreaterThanOrEqual(2);
    for (const t of res.data.teachers) {
      expect(t.performanceLabel).toBe(t.performanceScore === null ? "insufficient_data" : "scored");
      expect(typeof t.activeStudentCount).toBe("number");
    }
  });

  it("TEACHER yalnız kendi kaydını görür (PII minimizasyonu)", async () => {
    const res = await listTeachersTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t1" }), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.teachers.map((t) => t.id)).toEqual(["t1"]);
  });

  it("STUDENT fail-closed", async () => {
    expect((await listTeachersTool(ctx({ role: "STUDENT", userId: "u_s" }), {})).ok).toBe(false);
  });
});

describe("listBranchesTool / listRoomsTool", () => {
  it("şube + oda listeleri döner", async () => {
    const b = await listBranchesTool(ctx());
    const r = await listRoomsTool(ctx());
    expect(b.ok && b.data.branches.length).toBeGreaterThan(0);
    expect(r.ok && r.data.rooms.length).toBeGreaterThan(0);
    if (r.ok) expect(r.data.rooms.every((x) => typeof x.active === "boolean")).toBe(true);
  });

  it("STUDENT fail-closed", async () => {
    expect((await listBranchesTool(ctx({ role: "STUDENT", userId: "u_s" }))).ok).toBe(false);
    expect((await listRoomsTool(ctx({ role: "STUDENT", userId: "u_s" }))).ok).toBe(false);
  });
});

describe("listLessonsTool — admin Program gün listesi", () => {
  it("tarih aralığındaki dersleri isim zenginleştirmeli döner", async () => {
    const res = await listLessonsTool(ctx(), {
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lessons.length).toBeGreaterThan(0);
    expect(res.data.lessons[0]).toHaveProperty("studentName");
    expect(res.data.lessons[0]).toHaveProperty("teacherName");
  });

  it("geçersiz aralık VALIDATION_ERROR", async () => {
    const res = await listLessonsTool(ctx(), {
      from: new Date().toISOString(),
      to: new Date(Date.now() - 86400000).toISOString(),
    });
    expect(res.ok).toBe(false);
  });

  it("TEACHER/STUDENT fail-closed", async () => {
    const range = {
      from: new Date(Date.now() - 86400000).toISOString(),
      to: new Date().toISOString(),
    };
    expect((await listLessonsTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t" }), range)).ok).toBe(false);
    expect((await listLessonsTool(ctx({ role: "STUDENT", userId: "u_s" }), range)).ok).toBe(false);
  });
});

describe("getCollectionSummaryTool — tahsilat özeti", () => {
  it("seed verisiyle bekleyen/gecikmiş matematiği doğrudur", async () => {
    const res = await getCollectionSummaryTool(ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // p3(3400 bekleyen) + p4(1500 kısmi, vade geçmiş) + p5(3600 overdue) + p7(3200) + p8(5800)
    expect(res.data.pendingCount).toBe(5);
    expect(res.data.pendingTotal).toBe(17500);
    expect(res.data.overdueCount).toBe(2);
    expect(res.data.overdueTotal).toBe(5100);
    expect(res.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("TEACHER/STUDENT fail-closed", async () => {
    expect((await getCollectionSummaryTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t" }))).ok).toBe(false);
    expect((await getCollectionSummaryTool(ctx({ role: "STUDENT", userId: "u_s" }))).ok).toBe(false);
  });
});

describe("cancelLessonTool — REST'e açılış sözleşmesi", () => {
  async function makeLesson(): Promise<string> {
    const data = await readData();
    const startAt = await findOpenLessonSlot(data, "s1", "t1", "r1");
    const res = await createLessonTool(ctx(), {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Piyano",
      startAt,
    });
    if (!res.ok) throw new Error(res.error.message);
    return res.data.lessonId;
  }

  it("bilinmeyen ders NOT_FOUND", async () => {
    const res = await cancelLessonTool(ctx(), { lessonId: "yok-boyle-ders" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("çift iptal idempotent (ikinci çağrı no-op ok)", async () => {
    const id = await makeLesson();
    expect((await cancelLessonTool(ctx(), { lessonId: id })).ok).toBe(true);
    const again = await cancelLessonTool(ctx(), { lessonId: id });
    expect(again.ok).toBe(true);
    const data = await readData();
    expect(data.lessons.find((l) => l.id === id)?.status).toBe("cancelled");
  });

  it("TEACHER/STUDENT 403", async () => {
    const id = await makeLesson();
    const t = await cancelLessonTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t1" }), { lessonId: id });
    expect(t.ok).toBe(false);
    const s = await cancelLessonTool(ctx({ role: "STUDENT", userId: "u_s" }), { lessonId: id });
    expect(s.ok).toBe(false);
  });
});

describe("portal-access tool'ları — REST'e açılış sözleşmesi", () => {
  it("get/revoke/reactivate yalnız admin; TEACHER/STUDENT 403", async () => {
    await grantStudentAccess(ctx(), "s1", "GUARDIAN");
    const adminGet = await getStudentPortalAccessTool(ctx(), { studentId: "s1" });
    expect(adminGet.ok).toBe(true);

    expect((await getStudentPortalAccessTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t" }), { studentId: "s1" })).ok).toBe(false);
    expect((await getStudentPortalAccessTool(ctx({ role: "STUDENT", userId: "u_s" }), { studentId: "s1" })).ok).toBe(false);
    expect(
      (await revokeStudentPortalAccessTool(ctx({ role: "TEACHER", teacherId: "t1", userId: "u_t" }), { studentId: "s1", userId: "u_admin" })).ok
    ).toBe(false);
    expect(
      (await reactivateStudentPortalAccessTool(ctx({ role: "STUDENT", userId: "u_s" }), { studentId: "s1", userId: "u_admin" })).ok
    ).toBe(false);
  });

  it("revoke → reactivate döngüsü + idempotent reactivate", async () => {
    await grantStudentAccess(ctx(), "s1", "SELF");
    const me = ctx().userId;
    expect((await revokeStudentPortalAccessTool(ctx(), { studentId: "s1", userId: me })).ok).toBe(true);
    const afterRevoke = await getStudentPortalAccessTool(ctx(), { studentId: "s1" });
    expect(afterRevoke.ok && afterRevoke.data.accounts.find((a) => a.userId === me)?.status).toBe("revoked");

    expect((await reactivateStudentPortalAccessTool(ctx(), { studentId: "s1", userId: me })).ok).toBe(true);
    expect((await reactivateStudentPortalAccessTool(ctx(), { studentId: "s1", userId: me })).ok).toBe(true);
    const afterRe = await getStudentPortalAccessTool(ctx(), { studentId: "s1" });
    expect(afterRe.ok && afterRe.data.accounts.find((a) => a.userId === me)?.status).toBe("active");
  });

  it("bilinmeyen kayıt revoke/reactivate NOT_FOUND", async () => {
    const r = await revokeStudentPortalAccessTool(ctx(), { studentId: "s1", userId: "u_yok" });
    expect(r.ok).toBe(false);
    const re = await reactivateStudentPortalAccessTool(ctx(), { studentId: "s1", userId: "u_yok" });
    expect(re.ok).toBe(false);
  });
});
