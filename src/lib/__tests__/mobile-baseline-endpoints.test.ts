/**
 * Mobil baseline stabilizasyon hotfix — Bölüm B (404 giderme) + Bölüm C
 * (haftalık program isim eşleme). Bölüm B için gerçek HTTP katmanı (Bearer
 * JWT + route handler'ların kendisi) test edilir — mevcut task-tools.test.ts
 * zaten tool katmanı iş mantığını/RBAC'ını kapsamlı test ediyor, burada
 * yalnızca YENİ route wiring'inin (mobilin çağırdığı gerçek istek şekli)
 * doğru çalıştığı doğrulanır. Bölüm C tool katmanında test edilir (mevcut
 * diğer schedule testleriyle AYNI desen).
 *
 * Seed: s1.teacherId === t1, s2 farklı bir öğretmene ait değil ama t1'e
 * bağlı değil (bkz. seed.ts / diğer testlerdeki fikstür notu).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { issueTokenPair } from "../auth/jwt";
import type { AuthUser } from "../auth/types";
import { getTeacherScheduleTool, getStudentScheduleTool } from "../services/tools";
import type { ServiceContext } from "../services/context";
import { GET as getStudents } from "../../app/api/v1/teachers/[teacherId]/students/route";
import { GET as getPayouts } from "../../app/api/v1/teachers/[teacherId]/payouts/route";
import { GET as listTasks, POST as createTask } from "../../app/api/v1/tasks/route";
import { GET as getTaskDetail, POST as updateTask } from "../../app/api/v1/tasks/[taskId]/route";
import { POST as addComment } from "../../app/api/v1/tasks/[taskId]/comments/route";
import { GET as getStudentProfile } from "../../app/api/v1/students/[studentId]/route";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

async function bearer(user: AuthUser): Promise<string> {
  const { accessToken } = await issueTokenPair(user);
  return `Bearer ${accessToken}`;
}

function req(url: string, opts: { method?: string; auth?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = opts.auth;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("GET /api/v1/students/:studentId — kök neden P0-404 giderme (öğrenci detay ekranı)", () => {
  it("öğretmen kendi öğrencisinin profilini görebilir (önceden 404 veriyordu)", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await getStudentProfile(req("/api/v1/students/s1", { auth }), { params: { studentId: "s1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.id).toBe("s1");
    expect(json.data.name).toBeTruthy();
    expect(json.data.teacherName).toBeTruthy();
  });

  it("öğretmen erişemediği bir öğrencinin profilini göremez (FORBIDDEN, 404 DEĞİL bilgi sızdırmaz)", async () => {
    const auth = await bearer({ userId: "u-t2", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t2" });
    // s1.teacherId === t1, t2 DEĞİL.
    const res = await getStudentProfile(req("/api/v1/students/s1", { auth }), { params: { studentId: "s1" } });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("var olmayan bir öğrenci NOT_FOUND döner", async () => {
    const auth = await bearer({ userId: "u-admin", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const res = await getStudentProfile(req("/api/v1/students/does-not-exist", { auth }), { params: { studentId: "does-not-exist" } });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("admin herhangi bir öğrencinin profilini görebilir", async () => {
    const auth = await bearer({ userId: "u-admin", role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID });
    const res = await getStudentProfile(req("/api/v1/students/s1", { auth }), { params: { studentId: "s1" } });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("kimliği doğrulanmamış istek 401 döner", async () => {
    const res = await getStudentProfile(req("/api/v1/students/s1"), { params: { studentId: "s1" } });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/teachers/:teacherId/students — kök neden P0-404 giderme", () => {
  it("öğretmen kendi öğrenci listesini görebilir (önceden 404 veriyordu)", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await getStudents(req("/api/v1/teachers/t1/students", { auth }), { params: { teacherId: "t1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.students)).toBe(true);
    expect(json.data.students.some((s: { id: string }) => s.id === "s1")).toBe(true);
  });

  it("öğretmen başka bir öğretmenin listesini göremez (FORBIDDEN)", async () => {
    const auth = await bearer({ userId: "u-t2", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t2" });
    const res = await getStudents(req("/api/v1/teachers/t1/students", { auth }), { params: { teacherId: "t1" } });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /api/v1/teachers/:teacherId/payouts — kök neden P0-404 giderme", () => {
  it("öğretmen kendi hakediş kayıtlarını görebilir, boş liste bile olsa 404 DEĞİL 200 döner", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await getPayouts(req("/api/v1/teachers/t1/payouts", { auth }), { params: { teacherId: "t1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.payouts)).toBe(true);
  });

  it("öğretmen başka bir öğretmenin hakedişlerini göremez (FORBIDDEN)", async () => {
    const auth = await bearer({ userId: "u-t2", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t2" });
    const res = await getPayouts(req("/api/v1/teachers/t1/payouts", { auth }), { params: { teacherId: "t1" } });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });
});

describe("İş Takip REST route'ları — kök neden P0-404 giderme (tool mantığı zaten tasks-tools.test.ts'te)", () => {
  it("GET /api/v1/tasks öğretmenin kendi görevlerini listeler (önceden hiç route yoktu → 404)", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });
    const res = await listTasks(req("/api/v1/tasks?quickFilter=all", { auth }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.tasks)).toBe(true);
  });

  it("POST /api/v1/tasks ile görev oluşturulup GET /api/v1/tasks/:taskId ile detayı okunabilir, POST ile durumu değiştirilebilir", async () => {
    const auth = await bearer({ userId: "u-t1", role: "TEACHER", tenantId: DEFAULT_TENANT_ID, teacherId: "t1" });

    const createRes = await createTask(
      req("/api/v1/tasks", {
        method: "POST",
        auth,
        body: {
          title: "Veliyi ara",
          category: "Veli İletişimi",
          assigneeId: "u-t1",
          relatedEntityType: "student",
          relatedEntityId: "s1",
        },
      })
    );
    const created = await createRes.json();
    expect(created.ok).toBe(true);
    const taskId = created.data.taskId as string;

    const detailRes = await getTaskDetail(req(`/api/v1/tasks/${taskId}`, { auth }), { params: { taskId } });
    const detail = await detailRes.json();
    expect(detail.ok).toBe(true);
    expect(detail.data.task.title).toBe("Veliyi ara");
    expect(Array.isArray(detail.data.comments)).toBe(true);

    const updateRes = await updateTask(req(`/api/v1/tasks/${taskId}`, { method: "POST", auth, body: { status: "IN_PROGRESS" } }), {
      params: { taskId },
    });
    const updated = await updateRes.json();
    expect(updated.ok).toBe(true);

    const commentRes = await addComment(req(`/api/v1/tasks/${taskId}/comments`, { method: "POST", auth, body: { body: "Aradım, ulaşamadım." } }), {
      params: { taskId },
    });
    const comment = await commentRes.json();
    expect(comment.ok).toBe(true);
  });

  it("kimliği doğrulanmamış istek 401 döner (public bir endpoint DEĞİL)", async () => {
    const res = await listTasks(req("/api/v1/tasks"));
    expect(res.status).toBe(401);
  });
});

describe("Haftalık/günlük program — karşı taraf ismi zenginleştirmesi (kök neden: jenerik 'Öğrenci'/'Öğretmen' düşmesi)", () => {
  it("getTeacherScheduleTool artık her dersin studentName'ini gerçek öğrenci adıyla doldurur", async () => {
    const res = await getTeacherScheduleTool(ctx({ role: "TEACHER", userId: "u-t1", teacherId: "t1" }), { teacherId: "t1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lessons.length).toBeGreaterThan(0);
    const withStudent = res.data.lessons as Array<{ studentId: string; studentName?: string }>;
    for (const lesson of withStudent) {
      expect(lesson.studentName).toBeTruthy();
      expect(lesson.studentName).not.toBe("Öğrenci");
    }
  });

  it("getStudentScheduleTool artık her dersin teacherName'ini gerçek öğretmen adıyla doldurur (simetrik düzeltme)", async () => {
    const res = await getStudentScheduleTool(ctx({ role: "SCHOOL_ADMIN" }), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lessons.length).toBeGreaterThan(0);
    const withTeacher = res.data.lessons as Array<{ teacherId: string; teacherName?: string }>;
    for (const lesson of withTeacher) {
      expect(lesson.teacherName).toBeTruthy();
      expect(lesson.teacherName).not.toBe("Öğretmen");
    }
  });

  it("getStudentScheduleTool from/to verilmezse eski (sınırsız) davranışla birebir aynı sonucu döner", async () => {
    const withoutRange = await getStudentScheduleTool(ctx({ role: "SCHOOL_ADMIN" }), { studentId: "s1" });
    const withUndefinedRange = await getStudentScheduleTool(ctx({ role: "SCHOOL_ADMIN" }), {
      studentId: "s1",
      from: undefined,
      to: undefined,
    });
    expect(withoutRange.ok).toBe(true);
    expect(withUndefinedRange.ok).toBe(true);
    if (!withoutRange.ok || !withUndefinedRange.ok) return;
    expect(withUndefinedRange.data.lessons).toEqual(withoutRange.data.lessons);
  });

  it("getStudentScheduleTool from/to ile haftalık aralığa göre filtreler", async () => {
    const all = await getStudentScheduleTool(ctx({ role: "SCHOOL_ADMIN" }), { studentId: "s1" });
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    const allStarts = (all.data.lessons as Array<{ startAt: string }>).map((l) => l.startAt).sort();
    expect(allStarts.length).toBeGreaterThan(0);
    const from = allStarts[0]!;
    const to = allStarts[0]!;
    const ranged = await getStudentScheduleTool(ctx({ role: "SCHOOL_ADMIN" }), { studentId: "s1", from, to });
    expect(ranged.ok).toBe(true);
    if (!ranged.ok) return;
    for (const lesson of ranged.data.lessons as Array<{ startAt: string }>) {
      expect(lesson.startAt >= from && lesson.startAt <= to).toBe(true);
    }
    expect(ranged.data.lessons.length).toBeLessThanOrEqual(all.data.lessons.length);
  });
});
