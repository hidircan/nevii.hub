import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createHomeworkTool, updateHomeworkDueDateTool, listHomeworkForStudentTool } from "../services/tools";
import { HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { grantStudentAccess } from "./portal-access-test-helper";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}
function otherTeacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u9", tenantId: DEFAULT_TENANT_ID, teacherId: "t2", channel: "web", ...overrides };
}
function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u2", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}
function adminCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u3", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

const BASE = {
  studentId: "s1",
  title: "Gam çalışması",
  description: "Do majör gamını 4 oktav çalış",
  dueDate: "2026-09-01T00:00:00.000Z",
};

describe("FEATURE C — ödev son teslim tarihi güncelleme", () => {
  it("yetkili öğretmen (ödevin sahibi) son tarihi değiştirebilir", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateHomeworkDueDateTool(teacherCtx(), {
      homeworkId: created.data.homeworkId,
      dueDate: "2026-09-15T00:00:00.000Z",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.homework.dueDate).toBe("2026-09-15T00:00:00.000Z");
    // createdAt korunur (yalnızca dueDate değişir).
    expect(updated.data.homework.createdAt).toBeTruthy();
  });

  it("güncellenmiş son tarih öğrencinin listesine YANSIR (stale cache yok)", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await updateHomeworkDueDateTool(teacherCtx(), { homeworkId: created.data.homeworkId, dueDate: "2026-09-20T00:00:00.000Z" });

    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u2" }, "s1");
    const list = await listHomeworkForStudentTool(studentCtx({ studentId: "s1" }), { studentId: "s1" });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.homework[0]!.dueDate).toBe("2026-09-20T00:00:00.000Z");
  });

  it("başka bir öğretmen (ödevin sahibi değil) REDDEDİLİR", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await updateHomeworkDueDateTool(otherTeacherCtx(), {
      homeworkId: created.data.homeworkId,
      dueDate: "2026-09-15T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("öğrenci/veli son tarihi DEĞİŞTİREMEZ", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await updateHomeworkDueDateTool(studentCtx(), {
      homeworkId: created.data.homeworkId,
      dueDate: "2026-09-15T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("admin/SCHOOL_ADMIN de dahil olmak üzere yalnızca ÖDEVİ VEREN öğretmen değiştirebilir", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await updateHomeworkDueDateTool(adminCtx(), {
      homeworkId: created.data.homeworkId,
      dueDate: "2026-09-15T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("geçersiz tarih reddedilir", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await updateHomeworkDueDateTool(teacherCtx(), {
      homeworkId: created.data.homeworkId,
      dueDate: "bugun-degil-gecerli-bir-tarih-degil",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("olmayan bir ödev için NOT_FOUND döner", async () => {
    const res = await updateHomeworkDueDateTool(teacherCtx(), {
      homeworkId: "does-not-exist",
      dueDate: "2026-09-15T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });

  it("başka tenant'tan aynı id ile erişim NOT_FOUND döner (tenant izolasyonu)", async () => {
    const created = await createHomeworkTool(teacherCtx(), BASE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await updateHomeworkDueDateTool(teacherCtx({ tenantId: "other-tenant" }), {
      homeworkId: created.data.homeworkId,
      dueDate: "2026-09-15T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("NOT_FOUND");
  });
});
