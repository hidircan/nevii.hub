import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createHomeworkTool,
  listHomeworkForStudentTool,
  getHomeworkFileTool,
} from "../services/tools";
import { HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function teacherCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web", ...overrides };
}
function studentCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u2", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
  // Kok neden duzeltmesi (2026-08-31): assertStudentAccess/canAccessStudent
  // STUDENT rolu icin artik ctx.studentId karsilastirmasi DEGIL, aktif bir
  // StudentPortalAccess kaydi ariyor (bkz. portal-access-test-helper.ts).
  // Bu dosya o degisiklikten once yazilmisti ve hicbir yerde erisim
  // GRANT etmiyordu — her STUDENT cagrisi artik FORBIDDEN donuyordu. Her
  // testin kendi (varsa) grant'ini izole tutmak icin dosya da sifirlanir.
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

const BASE = {
  studentId: "s1",
  title: "Gam çalışması",
  description: "Do majör gamını 4 oktav çalış",
  dueDate: "2026-09-01T00:00:00.000Z",
};

describe("Ödev — öğretmenin dosya/foto/video eklemesi (Paket 7)", () => {
  it("dosya eklemeden ödev oluşturulabilir (opsiyonel)", async () => {
    const res = await createHomeworkTool(teacherCtx(), BASE);
    expect(res.ok).toBe(true);
  });

  it("geçerli bir jpeg dosyasıyla ödev oluşturulabilir ve öğrenci indirebilir", async () => {
    // Öğrenci portalı erişimi artık örtük değil — bkz. beforeEach notu.
    await grantStudentAccess(studentCtx(), "s1", "SELF");

    const fileData = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake image bytes")]).toString("base64");
    const res = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: "gam.jpg",
      fileMimeType: "image/jpeg",
      fileData,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const list = await listHomeworkForStudentTool(studentCtx(), { studentId: "s1" });
    expect(list.ok).toBe(true);
    if (list.ok) {
      // Liste "dosya var mı" göstergesi taşır, ham içerik taşımaz.
      expect(list.data.homework[0]!.fileData).toBe("1");
    }

    const file = await getHomeworkFileTool(studentCtx(), { homeworkId: res.data.homeworkId });
    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(file.data.fileData).toBe(fileData);
      expect(file.data.fileMimeType).toBe("image/jpeg");
    }
  });

  it("desteklenmeyen dosya türü reddedilir", async () => {
    const res = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: "virus.exe",
      fileMimeType: "application/x-msdownload",
      fileData: Buffer.from("x").toString("base64"),
    });
    expect(res.ok).toBe(false);
  });

  it("başka bir öğrencinin ödev dosyasına erişim reddedilir (tenant/sahiplik kontrolü)", async () => {
    const fileData = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake")]).toString("base64");
    const created = await createHomeworkTool(teacherCtx(), {
      ...BASE,
      fileName: "gam.jpg",
      fileMimeType: "image/jpeg",
      fileData,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const otherStudent = studentCtx({ studentId: "s2" });
    const file = await getHomeworkFileTool(otherStudent, { homeworkId: created.data.homeworkId });
    expect(file.ok).toBe(false);
  });

  it("yalnızca TEACHER ödev oluşturabilir (RBAC)", async () => {
    const res = await createHomeworkTool(studentCtx(), BASE);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});
