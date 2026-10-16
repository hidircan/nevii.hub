import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  getStudentScheduleTool,
  listHomeworkForStudentTool,
  listAssessmentsForStudentTool,
  createHomeworkTool,
  startLessonTool,
  sendParentMessageTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";

/**
 * Production hardening — own / cross-teacher / unauthorized erişim.
 * Tenant izolasyonu readData ALS'e bağlı; bu suite teacher ownership IDOR'u kilitler.
 */

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "TEACHER",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t1",
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
  // STUDENT rolü erişimi portal erişim tablosundan gelir (hasActiveStudentAccess). Önceki bir test dosyası aynı
  // `u1` için s1 erişimi bırakınca bu suite yalnız tam koşuda kırılıyordu (ürün sızıntısı değil, kalıntı veri).
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("getStudentScheduleTool — teacher ownership", () => {
  it("own-teacher: t1 → s1 (Zeynep) programını okur", async () => {
    const res = await getStudentScheduleTool(ctx({ teacherId: "t1" }), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.studentId).toBe("s1");
  });

  it("cross-teacher: t2 → s1 FORBIDDEN/NOT_FOUND (sızdırmaz)", async () => {
    const res = await getStudentScheduleTool(ctx({ teacherId: "t2" }), { studentId: "s1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(["FORBIDDEN", "NOT_FOUND"]).toContain(res.error.code);
  });

  it("unauthorized PARENT başka çocuğa erişemez", async () => {
    const res = await getStudentScheduleTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s2" }),
      { studentId: "s1" }
    );
    expect(res.ok).toBe(false);
  });
});

describe("listHomeworkForStudentTool / listAssessmentsForStudentTool", () => {
  it("cross-teacher ödev listesi reddedilir", async () => {
    const res = await listHomeworkForStudentTool(ctx({ teacherId: "t2" }), { studentId: "s1" });
    expect(res.ok).toBe(false);
  });

  it("own-teacher ödev listesi ok", async () => {
    const res = await listHomeworkForStudentTool(ctx({ teacherId: "t1" }), { studentId: "s1" });
    expect(res.ok).toBe(true);
  });

  it("cross-teacher değerlendirme listesi reddedilir", async () => {
    const res = await listAssessmentsForStudentTool(ctx({ teacherId: "t2" }), { studentId: "s1" });
    expect(res.ok).toBe(false);
  });
});

describe("createHomeworkTool — cross-teacher", () => {
  it("başka öğretmenin öğrencisine ödev oluşturamaz", async () => {
    const res = await createHomeworkTool(ctx({ teacherId: "t2" }), {
      studentId: "s1",
      title: "X",
      description: "Y",
      dueDate: "2026-09-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("startLessonTool — öğretmen hiç başlatamaz", () => {
  it("başka öğretmenin dersini başlatamaz", async () => {
    // l8 is t2/s2 in seed
    const res = await startLessonTool(ctx({ teacherId: "t1" }), { lessonId: "l8" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("sendParentMessageTool — teacher ownership", () => {
  it("TEACHER başka öğrencinin veli mesajını üretemez", async () => {
    const res = await sendParentMessageTool(ctx({ teacherId: "t2" }), {
      studentId: "s1",
      kind: "makeup_created",
    });
    expect(res.ok).toBe(false);
  });
});
