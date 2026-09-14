import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  submitTeacherFeedbackTool,
  listTeacherFeedbackForReviewTool,
  revealTeacherFeedbackIdentityTool,
  updateTeacherFeedbackStatusTool,
  setTeacherFeedbackSharedTool,
  getOwnTeacherFeedbackSummaryTool,
} from "../services/tools";
import { TEACHER_FEEDBACK_FILE_PATH, submitTeacherFeedback } from "../teacher-feedback";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const TENANT_B = "tenant-feedback-review-b";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "STUDENT",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    studentId: "s1",
    channel: "web",
    ...overrides,
  };
}

const FULL_SCORES = { clarity: 5, communication: 4, effectiveness: 5, motivation: 5, punctuality: 4 };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TEACHER_FEEDBACK_FILE_PATH, { force: true });
  // JWT studentId tek başına yetmez — u1'e her iki tenant'ta s1 için aktif SELF erişimi.
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u1" }, "s1", "SELF");
  await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u1" }, "s5", "SELF");
  await grantStudentAccess({ tenantId: TENANT_B, userId: "u1" }, "s1", "SELF");
});

async function submit(studentId: string, overrides?: Record<string, unknown>) {
  return submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId }), {
    studentId,
    scores: FULL_SCORES,
    ...overrides,
  });
}

describe("listTeacherFeedbackForReviewTool — kimlik varsayılan maskeli", () => {
  it("studentId/submittedBy döndürülen satırlarda YOK", async () => {
    await submit("s1");
    const res = await listTeacherFeedbackForReviewTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.feedback).toHaveLength(1);
    const row = res.data.feedback[0] as unknown as Record<string, unknown>;
    expect(row.studentId).toBeUndefined();
    expect(row.submittedBy).toBeUndefined();
    expect(row.scores).toEqual(FULL_SCORES);
  });

  it("TEACHER/PARENT/STUDENT için FORBIDDEN döner", async () => {
    await submit("s1");
    for (const role of ["TEACHER", "STUDENT", "STUDENT"] as const) {
      const res = await listTeacherFeedbackForReviewTool(
        ctx({ role, teacherId: role === "TEACHER" ? "t1" : undefined, studentId: role === "TEACHER" ? undefined : "s1" }),
        {}
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("status filtresi doğru satırları döner", async () => {
    const submitted = await submit("s1");
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    await updateTeacherFeedbackStatusTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      status: "reviewed",
    });

    const pending = await listTeacherFeedbackForReviewTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      status: "pending",
    });
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(pending.data.feedback).toHaveLength(0);

    const reviewed = await listTeacherFeedbackForReviewTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      status: "reviewed",
    });
    expect(reviewed.ok).toBe(true);
    if (reviewed.ok) expect(reviewed.data.feedback).toHaveLength(1);
  });

  it("sourceType filtresi STUDENT/PARENT ayrımını doğru uygular", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), { studentId: "s1", scores: FULL_SCORES });
    const studentOnly = await listTeacherFeedbackForReviewTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      sourceType: "STUDENT",
    });
    expect(studentOnly.ok).toBe(true);
    if (studentOnly.ok) expect(studentOnly.data.feedback).toHaveLength(1);

    const parentOnly = await listTeacherFeedbackForReviewTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      sourceType: "PARENT",
    });
    expect(parentOnly.ok).toBe(true);
    if (parentOnly.ok) expect(parentOnly.data.feedback).toHaveLength(0);
  });

  it("cross-tenant: başka tenant'ın geri bildirimi görünmez", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1", tenantId: TENANT_B }), {
      studentId: "s1",
      scores: FULL_SCORES,
    });
    const res = await listTeacherFeedbackForReviewTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.feedback).toHaveLength(0);
  });
});

describe("revealTeacherFeedbackIdentityTool — gerekçeli/audit'li kimlik açma", () => {
  it("5 karakterden kısa gerekçe VALIDATION_ERROR döner", async () => {
    const submitted = await submit("s1");
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const res = await revealTeacherFeedbackIdentityTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      reason: "ab",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("geçerli gerekçeyle doğru öğrenci kimliğini döner", async () => {
    const submitted = await submit("s1");
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const res = await revealTeacherFeedbackIdentityTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      reason: "Veli şikayeti takibi için gerekli",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.studentId).toBe("s1");
    expect(res.data.submittedBy).toBe("u1");
  });

  it("TEACHER/PARENT/STUDENT kimlik açamaz (FORBIDDEN)", async () => {
    const submitted = await submit("s1");
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    for (const role of ["TEACHER", "STUDENT", "STUDENT"] as const) {
      const res = await revealTeacherFeedbackIdentityTool(
        ctx({ role, teacherId: role === "TEACHER" ? "t1" : undefined, studentId: role === "TEACHER" ? undefined : "s1" }),
        { feedbackId: submitted.data.feedbackId, reason: "Yetkisiz deneme burada" }
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("olmayan bir kayıt için NOT_FOUND döner, sızıntı yok", async () => {
    const res = await revealTeacherFeedbackIdentityTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: "does-not-exist",
      reason: "Herhangi bir gerekçe metni",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });
});

describe("updateTeacherFeedbackStatusTool / setTeacherFeedbackSharedTool", () => {
  it("SCHOOL_ADMIN durumu değiştirebilir, TEACHER değiştiremez", async () => {
    const submitted = await submit("s1");
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const denied = await updateTeacherFeedbackStatusTool(ctx({ role: "TEACHER", teacherId: "t1", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      status: "actioned",
    });
    expect(denied.ok).toBe(false);

    const allowed = await updateTeacherFeedbackStatusTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      status: "actioned",
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.data.status).toBe("actioned");
  });

  it("sharedWithTeacher yalnızca admin tarafından açılıp kapatılabilir", async () => {
    const submitted = await submit("s1", { comment: "Yapıcı bir yorum" });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const denied = await setTeacherFeedbackSharedTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      feedbackId: submitted.data.feedbackId,
      shared: true,
    });
    expect(denied.ok).toBe(false);

    const allowed = await setTeacherFeedbackSharedTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      shared: true,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.data.sharedWithTeacher).toBe(true);
  });
});

describe("getOwnTeacherFeedbackSummaryTool — anonim eşik + yalnız kendi öğretmenliği", () => {
  it("eşik altında (< 3 yanıt) hiçbir skor/yorum dönmez, yalnız sayaç", async () => {
    await submit("s1");
    const res = await getOwnTeacherFeedbackSummaryTool(ctx({ role: "TEACHER", teacherId: "t1", studentId: undefined }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.eligible).toBe(false);
    expect(res.data.responseCount).toBe(1);
    expect(res.data.criteriaAverages).toBeNull();
    expect(res.data.continueDistribution).toBeNull();
    expect(res.data.sharedComments).toHaveLength(0);
  });

  it("eşik sağlanınca (>= 3 yanıt) doğru ortalama + yalnız paylaşılan yorumlar döner", async () => {
    const s1 = await submit("s1", { comment: "Paylaşılmayacak yorum" });
    const s5 = await submit("s5", { comment: "Paylaşılacak yorum", continueWithTeacher: "yes" });
    expect(s1.ok).toBe(true);
    expect(s5.ok).toBe(true);
    if (!s5.ok) return;

    // Seed verisinde t1'e atanmış yalnızca 2 öğrenci (s1, s5) var — aynı ay
    // içinde aynı öğrenciyi tekrar göndermek GÜNCELLEME sayılır (satır artmaz),
    // bu yüzden eşiği sağlayan üçüncü, farklı bir kayıt doğrudan store
    // katmanından eklenir (institution-export.test.ts'teki desenle aynı).
    await submitTeacherFeedback({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s-synthetic-3",
      submittedBy: "u-synthetic-3",
      submitterRole: "STUDENT",
      scores: { clarity: 1, communication: 1, effectiveness: 1, motivation: 1, punctuality: 1 },
      comment: "Üçüncü yorum, paylaşılmıyor",
    });

    await setTeacherFeedbackSharedTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: s5.data.feedbackId,
      shared: true,
    });

    const res = await getOwnTeacherFeedbackSummaryTool(ctx({ role: "TEACHER", teacherId: "t1", studentId: undefined }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.eligible).toBe(true);
    expect(res.data.responseCount).toBe(3);
    expect(res.data.sharedComments).toEqual(["Paylaşılacak yorum"]);
    expect(res.data.continueDistribution?.yes).toBe(1);
  });

  it("PARENT/STUDENT/SCHOOL_ADMIN özet çağıramaz (yalnız TEACHER)", async () => {
    for (const role of ["STUDENT", "STUDENT", "SCHOOL_ADMIN"] as const) {
      const res = await getOwnTeacherFeedbackSummaryTool(
        ctx({ role, studentId: role === "SCHOOL_ADMIN" ? undefined : "s1" })
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("ctx.teacherId eksikse (beklenmez) fail-closed FORBIDDEN döner", async () => {
    const res = await getOwnTeacherFeedbackSummaryTool(ctx({ role: "TEACHER", teacherId: undefined, studentId: undefined }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});
