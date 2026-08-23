import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createHomeworkTool,
  submitHomeworkTool,
  listHomeworkForStudentTool,
  listHomeworkForTeacherTool,
  listHomeworkSubmissionsTool,
  reviewHomeworkSubmissionTool,
  getHomeworkSubmissionFileTool,
  createTeachingMaterialTool,
  listTeachingMaterialsForStudentTool,
  listTeachingMaterialsForTeacherTool,
  getTeachingMaterialFileTool,
} from "../services/tools";
import { HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import { TEACHING_MATERIALS_FILE_PATH } from "../teaching-materials";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

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
  await fs.rm(TEACHING_MATERIALS_FILE_PATH, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

const VALID_HOMEWORK = {
  studentId: "s1",
  title: "Gam çalışması",
  description: "Do majör gamını 4 oktav çalış",
  dueDate: "2026-09-01T00:00:00.000Z",
};

async function createValidHomework(teacherId = "t1") {
  const result = await createHomeworkTool(ctx({ teacherId }), VALID_HOMEWORK);
  if (!result.ok) throw new Error("setup failed: " + result.error.message);
  return result.data.homeworkId;
}

describe("createHomeworkTool — TEACHER yalnızca kendi öğrencisi", () => {
  it("TEACHER kendi öğrencisi (s1, teacherId=t1) için ödev oluşturabilir", async () => {
    const result = await createHomeworkTool(ctx({ teacherId: "t1" }), VALID_HOMEWORK);
    expect(result.ok).toBe(true);
  });

  it("TEACHER başka öğretmenin öğrencisi için ödev oluşturamaz (FORBIDDEN)", async () => {
    const result = await createHomeworkTool(ctx({ teacherId: "t2" }), VALID_HOMEWORK);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("SCHOOL_ADMIN ödev oluşturamaz (yalnızca TEACHER)", async () => {
    const result = await createHomeworkTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }),
      VALID_HOMEWORK
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("STUDENT/PARENT ödev oluşturamaz", async () => {
    const asStudent = await createHomeworkTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" }),
      VALID_HOMEWORK
    );
    expect(asStudent.ok).toBe(false);

    const asParent = await createHomeworkTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" }),
      VALID_HOMEWORK
    );
    expect(asParent.ok).toBe(false);
  });
});

describe("listHomeworkForStudentTool — erişim kapsaması", () => {
  it("STUDENT yalnızca kendi ödevlerini görebilir", async () => {
    const homeworkId = await createValidHomework();

    const ownCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(ownCtx, "s1", "SELF");
    const own = await listHomeworkForStudentTool(ownCtx, { studentId: "s1" });
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.data.homework.map((h) => h.id)).toContain(homeworkId);

    const other = await listHomeworkForStudentTool(
      ctx({ role: "STUDENT", userId: "u-other", teacherId: undefined, studentId: "s2" }),
      { studentId: "s1" }
    );
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("FORBIDDEN");
  });

  it("veli (STUDENT rolü, GUARDIAN erişimi) yalnızca kendi çocuğunun ödevlerini görebilir", async () => {
    await createValidHomework();
    const parentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");
    const result = await listHomeworkForStudentTool(parentCtx, { studentId: "s1" });
    expect(result.ok).toBe(true);
  });

  it("TEACHER başka öğretmenin öğrencisinin ödevlerini göremez", async () => {
    await createValidHomework("t1");
    const result = await listHomeworkForStudentTool(ctx({ teacherId: "t2" }), { studentId: "s1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});

describe("listHomeworkForTeacherTool", () => {
  it("TEACHER kendi verdiği ödevleri listeler", async () => {
    await createValidHomework("t1");
    const result = await listHomeworkForTeacherTool(ctx({ teacherId: "t1" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.homework).toHaveLength(1);
  });
});

describe("submitHomeworkTool — STUDENT yalnızca kendi ödevi", () => {
  it("STUDENT kendi ödevine teslim yükleyebilir", async () => {
    const homeworkId = await createValidHomework();
    const selfCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(selfCtx, "s1", "SELF");
    const result = await submitHomeworkTool(selfCtx, { homeworkId, note: "Tamamladım" });
    expect(result.ok).toBe(true);
  });

  it("STUDENT başka öğrencinin ödevine teslim yükleyemez", async () => {
    const homeworkId = await createValidHomework();
    const result = await submitHomeworkTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s2" }),
      { homeworkId, note: "Denemek" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER/veli (GUARDIAN erişimi) teslim yükleyemez — yalnızca SELF yükleyebilir", async () => {
    const homeworkId = await createValidHomework();
    const asTeacher = await submitHomeworkTool(ctx({ teacherId: "t1" }), { homeworkId });
    expect(asTeacher.ok).toBe(false);
    const parentCtx = ctx({ role: "STUDENT", userId: "guardian-x", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");
    const asParent = await submitHomeworkTool(parentCtx, { homeworkId });
    expect(asParent.ok).toBe(false);
  });
});

describe("reviewHomeworkSubmissionTool / getHomeworkSubmissionFileTool — sahiplik", () => {
  async function createSubmissionWithFile() {
    const homeworkId = await createValidHomework("t1");
    const selfCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(selfCtx, "s1", "SELF");
    const result = await submitHomeworkTool(
      selfCtx,
      {
        homeworkId,
        note: "İşte teslimim",
        fileName: "kayit.mp3",
        fileMimeType: "audio/mpeg",
        fileData: Buffer.from("fake-audio-bytes").toString("base64"),
      }
    );
    if (!result.ok) throw new Error("setup failed");
    return { homeworkId, submissionId: result.data.submissionId };
  }

  it("TEACHER kendi öğrencisinin teslimine geri bildirim yazabilir", async () => {
    const { submissionId } = await createSubmissionWithFile();
    const result = await reviewHomeworkSubmissionTool(ctx({ teacherId: "t1" }), {
      submissionId,
      teacherFeedback: "Harika çalışmışsın!",
    });
    expect(result.ok).toBe(true);
  });

  it("TEACHER başka öğretmenin öğrencisinin teslimine geri bildirim yazamaz", async () => {
    const { submissionId } = await createSubmissionWithFile();
    const result = await reviewHomeworkSubmissionTool(ctx({ teacherId: "t2" }), {
      submissionId,
      teacherFeedback: "Erişimim olmamalı",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("listHomeworkSubmissionsTool özet döner (fileData tam gövde değil)", async () => {
    const { homeworkId } = await createSubmissionWithFile();
    const result = await listHomeworkSubmissionsTool(ctx({ teacherId: "t1" }), { homeworkId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.submissions).toHaveLength(1);
    expect(result.data.submissions[0].fileData).toBe("1");
  });

  it("dosyaya yalnızca sahibi (öğrenci/veli/kendi öğretmeni) erişebilir", async () => {
    const { submissionId } = await createSubmissionWithFile();

    const asOwnStudent = await getHomeworkSubmissionFileTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" }),
      { submissionId }
    );
    expect(asOwnStudent.ok).toBe(true);
    if (asOwnStudent.ok) expect(asOwnStudent.data.fileData).toBeTruthy();

    const asOtherStudent = await getHomeworkSubmissionFileTool(
      ctx({ role: "STUDENT", userId: "u-other", teacherId: undefined, studentId: "s2" }),
      { submissionId }
    );
    expect(asOtherStudent.ok).toBe(false);
    if (!asOtherStudent.ok) expect(asOtherStudent.error.code).toBe("FORBIDDEN");

    const asOtherTeacher = await getHomeworkSubmissionFileTool(ctx({ teacherId: "t2" }), {
      submissionId,
    });
    expect(asOtherTeacher.ok).toBe(false);
  });
});

const VALID_MATERIAL = {
  title: "Gam pratik videosu",
  description: "Piyano için gam çalışma tekniği",
};

describe("createTeachingMaterialTool — yalnızca TEACHER", () => {
  it("TEACHER materyal oluşturabilir", async () => {
    const result = await createTeachingMaterialTool(ctx({ teacherId: "t1" }), VALID_MATERIAL);
    expect(result.ok).toBe(true);
  });

  it("SCHOOL_ADMIN materyal oluşturamaz", async () => {
    const result = await createTeachingMaterialTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined }),
      VALID_MATERIAL
    );
    expect(result.ok).toBe(false);
  });
});

describe("listTeachingMaterialsForStudentTool — hedefleme + öğretmen sahipliği", () => {
  it("hedeflenmemiş (genel) materyal her öğrenciye görünür", async () => {
    await createTeachingMaterialTool(ctx({ teacherId: "t1" }), VALID_MATERIAL);
    const studentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(studentCtx, "s1", "SELF");
    const result = await listTeachingMaterialsForStudentTool(studentCtx, { studentId: "s1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.materials).toHaveLength(1);
  });

  it("enstrümana hedeflenmiş materyal yalnızca o enstrümanı çalan öğrenciye görünür", async () => {
    await createTeachingMaterialTool(ctx({ teacherId: "t1" }), {
      ...VALID_MATERIAL,
      targetInstrument: "Gitar",
    });
    // s1 (t1) Piyano çalıyor — Gitar'a hedeflenmiş materyali GÖRMEMELİ.
    const studentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(studentCtx, "s1", "SELF");
    const result = await listTeachingMaterialsForStudentTool(studentCtx, { studentId: "s1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.materials).toHaveLength(0);
  });

  it("başka öğretmenin materyali kendi öğrencisine görünmez", async () => {
    // t2'nin materyali — s1'in öğretmeni t1, dolayısıyla görünmemeli.
    await createTeachingMaterialTool(ctx({ teacherId: "t2" }), VALID_MATERIAL);
    const studentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(studentCtx, "s1", "SELF");
    const result = await listTeachingMaterialsForStudentTool(studentCtx, { studentId: "s1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.materials).toHaveLength(0);
  });
});

describe("listTeachingMaterialsForTeacherTool / getTeachingMaterialFileTool", () => {
  it("TEACHER kendi paylaştığı materyalleri listeler", async () => {
    await createTeachingMaterialTool(ctx({ teacherId: "t1" }), VALID_MATERIAL);
    const result = await listTeachingMaterialsForTeacherTool(ctx({ teacherId: "t1" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.materials).toHaveLength(1);
  });

  it("dosyaya yalnızca hedeflenen öğrenci/kendi öğretmeni erişebilir", async () => {
    const created = await createTeachingMaterialTool(ctx({ teacherId: "t1" }), {
      ...VALID_MATERIAL,
      fileName: "video.mp4",
      fileMimeType: "video/mp4",
      fileData: Buffer.from("fake-video-bytes").toString("base64"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const asOwnStudent = await getTeachingMaterialFileTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" }),
      { materialId: created.data.materialId }
    );
    expect(asOwnStudent.ok).toBe(true);

    const asOtherTeacherStudent = await getTeachingMaterialFileTool(
      ctx({ role: "STUDENT", teacherId: undefined, studentId: "s2" }),
      { materialId: created.data.materialId }
    );
    expect(asOtherTeacherStudent.ok).toBe(false);
    if (!asOtherTeacherStudent.ok) expect(asOtherTeacherStudent.error.code).toBe("FORBIDDEN");
  });
});
