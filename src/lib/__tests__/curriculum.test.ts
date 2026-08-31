import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  computeOverallCurriculumProgress,
  defaultProgressForStatus,
  CURRICULUM_TOPICS_FILE,
} from "../curriculum";
import {
  createCurriculumTopicTool,
  updateCurriculumTopicTool,
  listCurriculumForStudentTool,
  bulkAssignCurriculumTopicsTool,
} from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "TEACHER",
    userId: "u_teacher",
    tenantId: DEFAULT_TENANT_ID,
    teacherId: "t1",
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(CURRICULUM_TOPICS_FILE, { force: true });
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("computeOverallCurriculumProgress", () => {
  it("boş liste 0 döner", () => {
    expect(computeOverallCurriculumProgress([])).toBe(0);
  });

  it("eşit ağırlıklı ortalama (açıklanabilir)", () => {
    expect(
      computeOverallCurriculumProgress([{ progressPercent: 0 }, { progressPercent: 100 }])
    ).toBe(50);
  });

  it("status varsayılan progress", () => {
    expect(defaultProgressForStatus("planned")).toBe(0);
    expect(defaultProgressForStatus("in_progress")).toBe(50);
    expect(defaultProgressForStatus("mastered")).toBe(100);
  });
});

describe("createCurriculumTopicTool — ownership", () => {
  it("own-teacher konu oluşturur", async () => {
    const res = await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "Do majör gam",
      status: "planned",
    });
    expect(res.ok).toBe(true);
  });

  it("cross-teacher konu oluşturamaz", async () => {
    const res = await createCurriculumTopicTool(ctx({ teacherId: "t2" }), {
      studentId: "s1",
      title: "X",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("listCurriculumForStudentTool — rol kapsamı", () => {
  it("TEACHER kendi öğrencisinin konularını ve overallPercent görür", async () => {
    await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "A",
      status: "in_progress",
    });
    await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "B",
      status: "mastered",
    });
    const res = await listCurriculumForStudentTool(ctx({ teacherId: "t1" }), { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.overallPercent).toBe(75);
    expect(res.data.topics).toHaveLength(2);
    expect(res.data.progressExplanation).toContain("aritmetik ortalama");
  });

  it("cross-teacher listeyi göremez", async () => {
    await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "A",
    });
    const res = await listCurriculumForStudentTool(ctx({ teacherId: "t2" }), { studentId: "s1" });
    expect(res.ok).toBe(false);
  });

  it("veli (STUDENT rolü, GUARDIAN erişimi) özet görür (history/notes detayı yok)", async () => {
    await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "Gam",
      notes: "gizli not",
      status: "in_progress",
    });
    const parentCtx = ctx({ role: "STUDENT", teacherId: undefined, studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");
    const res = await listCurriculumForStudentTool(parentCtx, { studentId: "s1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.overallPercent).toBe(50);
    const topic = res.data.topics[0] as { title: string; notes?: string; history?: unknown };
    expect(topic.title).toBe("Gam");
    expect(topic.notes).toBeUndefined();
    expect(topic.history).toBeUndefined();
  });
});

describe("createCurriculumTopicTool / updateCurriculumTopicTool — admin ve rol izinleri", () => {
  it("SCHOOL_ADMIN kurumundaki herhangi bir öğrenci için konu oluşturur ve günceller", async () => {
    const adminCtx = ctx({ role: "SCHOOL_ADMIN", teacherId: undefined, userId: "u_admin" });
    const created = await createCurriculumTopicTool(adminCtx, {
      studentId: "s1",
      title: "Admin konusu",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateCurriculumTopicTool(adminCtx, {
      topicId: created.data.topicId,
      status: "in_progress",
    });
    expect(updated.ok).toBe(true);
  });

  it("STUDENT/GUARDIAN konu oluşturamaz/güncelleyemez (FORBIDDEN)", async () => {
    const studentCtx = ctx({ role: "STUDENT", teacherId: undefined, userId: "u_student", studentId: "s1" });
    const created = await createCurriculumTopicTool(studentCtx, {
      studentId: "s1",
      title: "İzinsiz konu",
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.code).toBe("FORBIDDEN");

    const byAdmin = await createCurriculumTopicTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined, userId: "u_admin" }),
      { studentId: "s1", title: "Admin konusu" }
    );
    expect(byAdmin.ok).toBe(true);
    if (!byAdmin.ok) return;
    const updatedByStudent = await updateCurriculumTopicTool(studentCtx, {
      topicId: byAdmin.data.topicId,
      status: "mastered",
    });
    expect(updatedByStudent.ok).toBe(false);
    if (!updatedByStudent.ok) expect(updatedByStudent.error.code).toBe("FORBIDDEN");
  });

  it("Tenant A'da oluşturulan konu Tenant B'nin listesinde görünmez", async () => {
    const created = await createCurriculumTopicTool(ctx({ teacherId: "t1", tenantId: "tenant-a" }), {
      studentId: "s1",
      title: "Tenant A konusu",
    });
    expect(created.ok).toBe(true);

    const otherTenantList = await listCurriculumForStudentTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined, tenantId: "tenant-b" }),
      { studentId: "s1" }
    );
    expect(otherTenantList.ok).toBe(true);
    if (!otherTenantList.ok) return;
    expect(otherTenantList.data.topics).toHaveLength(0);
  });
});

describe("bulkAssignCurriculumTopicsTool", () => {
  it("Admin, filtrelenmiş seçili öğrencilere (s1, s5 — t1'e ait) toplu konu atar", async () => {
    const res = await bulkAssignCurriculumTopicsTool(
      ctx({ role: "SCHOOL_ADMIN", teacherId: undefined, userId: "u_admin" }),
      {
        studentIds: ["s1", "s5"],
        topics: [
          { sortOrder: 1, title: "Bağlama giriş" },
          { sortOrder: 2, title: "Düzen akort" },
        ],
      }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.requestedStudents).toBe(2);
    expect(res.data.requestedTopics).toBe(2);
    expect(res.data.created).toBe(4);
    expect(res.data.skippedInaccessible).toBe(0);
    expect(res.data.skippedExisting).toBe(0);

    const list = await listCurriculumForStudentTool(ctx({ teacherId: "t1" }), { studentId: "s1" });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.topics).toHaveLength(2);
  });

  it("Teacher kendi öğrencisine (s1) toplu atar, sahip olmadığı öğrenciyi (s2) atlar", async () => {
    const res = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: ["s1", "s2"],
      topics: [{ sortOrder: 1, title: "Etüt A" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(1);
    expect(res.data.skippedInaccessible).toBe(1);
  });

  it("STUDENT/GUARDIAN 403 alır", async () => {
    const res = await bulkAssignCurriculumTopicsTool(
      ctx({ role: "STUDENT", teacherId: undefined, userId: "u_student", studentId: "s1" }),
      { studentIds: ["s1"], topics: [{ sortOrder: 1, title: "X" }] }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });

  it("Sahip olmayan öğretmen tüm öğrencileri erişimsiz olarak atlar (tenant/sahiplik sınırı)", async () => {
    const res = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t9" }), {
      studentIds: ["s1"],
      topics: [{ sortOrder: 1, title: "X" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(0);
    expect(res.data.skippedInaccessible).toBe(1);
  });

  it("aynı öğrenci + aynı başlık tekrar gönderimde çoğalmaz", async () => {
    const first = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: ["s1"],
      topics: [{ sortOrder: 1, title: "Tekrarlanan konu" }],
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.created).toBe(1);

    const second = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: ["s1"],
      topics: [{ sortOrder: 1, title: "Tekrarlanan konu" }],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.created).toBe(0);
    expect(second.data.skippedExisting).toBe(1);
  });

  it("aynı istekte tekrar eden başlık da yalnızca bir kez oluşturulur", async () => {
    const res = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: ["s1"],
      topics: [
        { sortOrder: 1, title: "Aynı başlık" },
        { sortOrder: 2, title: "Aynı başlık" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.created).toBe(1);
    expect(res.data.skippedExisting).toBe(1);
  });

  it("100 konu / 200 öğrenci sınırlarını aşan girdi reddedilir", async () => {
    const tooManyTopics = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: ["s1"],
      topics: Array.from({ length: 101 }, (_, i) => ({ sortOrder: i, title: `Konu ${i}` })),
    });
    expect(tooManyTopics.ok).toBe(false);

    const tooManyStudents = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: Array.from({ length: 201 }, (_, i) => `s${i}`),
      topics: [{ sortOrder: 1, title: "X" }],
    });
    expect(tooManyStudents.ok).toBe(false);
  });

  it("boş başlık reddedilir", async () => {
    const res = await bulkAssignCurriculumTopicsTool(ctx({ teacherId: "t1" }), {
      studentIds: ["s1"],
      topics: [{ sortOrder: 1, title: "   " }],
    });
    expect(res.ok).toBe(false);
  });
});

describe("updateCurriculumTopicTool", () => {
  it("durum değişince varsayılan progress uygular ve history yazar", async () => {
    const created = await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "Etüt 1",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = await updateCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      topicId: created.data.topicId,
      status: "mastered",
      changeNote: "Sınav sonrası",
    });
    expect(updated.ok).toBe(true);
    const list = await listCurriculumForStudentTool(ctx({ teacherId: "t1" }), { studentId: "s1" });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const full = list.data.topics[0] as {
      progressPercent: number;
      status: string;
      history: { action: string; note?: string }[];
    };
    expect(full.status).toBe("mastered");
    expect(full.progressPercent).toBe(100);
    expect(full.history.some((h) => h.action === "status_changed" && h.note === "Sınav sonrası")).toBe(
      true
    );
  });

  it("başka öğretmen güncelleyemez", async () => {
    const created = await createCurriculumTopicTool(ctx({ teacherId: "t1" }), {
      studentId: "s1",
      title: "X",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const res = await updateCurriculumTopicTool(ctx({ teacherId: "t2" }), {
      topicId: created.data.topicId,
      status: "in_progress",
    });
    expect(res.ok).toBe(false);
  });
});
