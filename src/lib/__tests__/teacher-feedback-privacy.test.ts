import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { submitTeacherFeedbackTool, listTeacherFeedbackTool, setTeacherFeedbackSharedTool } from "../services/tools";
import { TEACHER_FEEDBACK_FILE_PATH } from "../teacher-feedback";
import { hasPermission } from "../auth/rbac";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { NOTIFICATIONS_FILE, listNotificationsForUser } from "../notifications";
import { NOTIFICATION_PREFERENCES_FILE, setNotificationPreferences } from "../notification-preferences";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

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

const VALID_FEEDBACK = {
  studentId: "s1",
  scores: { clarity: 5, communication: 4, effectiveness: 5, motivation: 5, punctuality: 4 },
  comment: "Çok iyi bir öğretmen",
};

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TEACHER_FEEDBACK_FILE_PATH, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(NOTIFICATION_PREFERENCES_FILE, { force: true });
});

describe("EPIC 6C — submitTeacherFeedbackTool: yalnızca kendi çocuğu/kendisi için", () => {
  it("PARENT kendi çocuğu için geri bildirim gönderebilir", async () => {
    const result = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    expect(result.ok).toBe(true);
  });

  it("STUDENT kendisi için geri bildirim gönderebilir", async () => {
    const result = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    expect(result.ok).toBe(true);
  });

  it("PARENT başka bir çocuk için geri bildirim gönderemez (FORBIDDEN)", async () => {
    const result = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s2" }), VALID_FEEDBACK);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("TEACHER/SCHOOL_ADMIN geri bildirim gönderemez", async () => {
    const asTeacher = await submitTeacherFeedbackTool(
      ctx({ role: "TEACHER", teacherId: "t1", studentId: undefined }),
      VALID_FEEDBACK
    );
    expect(asTeacher.ok).toBe(false);

    const asAdmin = await submitTeacherFeedbackTool(
      ctx({ role: "SCHOOL_ADMIN", studentId: undefined }),
      VALID_FEEDBACK
    );
    expect(asAdmin.ok).toBe(false);
  });

  it("puan aralığı dışı (0 veya 6) VALIDATION_ERROR döner", async () => {
    const result = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      ...VALID_FEEDBACK,
      scores: { ...VALID_FEEDBACK.scores, clarity: 6 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("beş kriterden biri eksikse VALIDATION_ERROR döner", async () => {
    const { punctuality: _omit, ...incompleteScores } = VALID_FEEDBACK.scores;
    void _omit;
    const result = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      studentId: "s1",
      scores: incompleteScores,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("EPIC 6C — aynı ay tekrar kuralı: ikinci gönderim yeni kayıt değil, güncelleme", () => {
  it("aynı ay içinde aynı öğrenci+öğretmen için ikinci gönderim mevcut kaydı günceller", async () => {
    const first = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.updated).toBe(false);

    const second = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      ...VALID_FEEDBACK,
      scores: { ...VALID_FEEDBACK.scores, clarity: 2 },
      comment: "Güncellenmiş yorum",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.updated).toBe(true);
    expect(second.data.feedbackId).toBe(first.data.feedbackId);

    const listed = await listTeacherFeedbackTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    // Aynı ay içinde tek kayıt kalmalı — çift kayıt yok.
    expect(listed.data.feedback).toHaveLength(1);
    expect(listed.data.feedback[0].scores.clarity).toBe(2);
    expect(listed.data.feedback[0].comment).toBe("Güncellenmiş yorum");
  });
});

describe("EPIC 6C — gizlilik: yalnızca SCHOOL_ADMIN/SUPER_ADMIN görebilir, öğretmen kendi geri bildirimini GÖREMEZ", () => {
  it("RBAC kataloğunda TEACHER rolünün teacher_feedback:read izni YOK", () => {
    expect(hasPermission("TEACHER", "teacher_feedback:read")).toBe(false);
  });

  it("listTeacherFeedbackTool TEACHER için FORBIDDEN döner", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    const result = await listTeacherFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1", studentId: undefined }), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("listTeacherFeedbackTool PARENT/STUDENT için de FORBIDDEN döner", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    const asParent = await listTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), {});
    expect(asParent.ok).toBe(false);
  });

  it("SCHOOL_ADMIN gönderilen geri bildirimi görebilir", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    const result = await listTeacherFeedbackTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feedback).toHaveLength(1);
    expect(result.data.feedback[0].teacherId).toBe("t1");
    expect(result.data.feedback[0].status).toBe("pending");
  });

  it("teacherId filtresiyle yalnızca o öğretmenin geri bildirimleri döner", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK); // t1
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s2" }), {
      ...VALID_FEEDBACK,
      studentId: "s2",
    }); // t2

    const result = await listTeacherFeedbackTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      teacherId: "t2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feedback).toHaveLength(1);
    expect(result.data.feedback[0].teacherId).toBe("t2");
  });
});

describe("yönetici bildirimi (teacher_feedback_submitted)", () => {
  it("değerlendirme gönderilince yöneticilere bildirim oluşur, geri-bildirim ekranına yönlendirir, yorumu taşımaz", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_manager_ezgi" });
    const note = notes.find((n) => n.kind === "teacher_feedback_submitted");
    expect(note).toBeDefined();
    expect(note!.title).toBe("Yeni öğretmen değerlendirmesi");
    expect(note!.body).toContain("/panel/ogretmenler/t1/geri-bildirim");
    expect(note!.body).not.toContain(VALID_FEEDBACK.comment);
  });

  it("tercih kapalıyken bildirim oluşmaz", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_manager_ezgi", [
      { category: "teacher_feedback_submitted", inAppEnabled: false },
    ]);
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_manager_ezgi" });
    expect(notes.some((n) => n.kind === "teacher_feedback_submitted")).toBe(false);
  });

  it("aynı ay içindeki tekrar gönderim (update) duplicate bildirim üretmez", async () => {
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      ...VALID_FEEDBACK,
      comment: "İkinci deneme",
    });
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_manager_ezgi" });
    expect(notes.filter((n) => n.kind === "teacher_feedback_submitted")).toHaveLength(1);
  });
});

describe("öğretmen bildirimi (teacher_feedback_shared)", () => {
  it("yönetici bir yorumu paylaşınca öğretmene bildirim gider", async () => {
    const submitted = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const shared = await setTeacherFeedbackSharedTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      shared: true,
    });
    expect(shared.ok).toBe(true);

    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t1" });
    const note = notes.find((n) => n.kind === "teacher_feedback_shared");
    expect(note).toBeDefined();
    expect(note!.title).toBe("Hakkınızda değerlendirme var");
  });

  it("paylaşımı geri almak (shared:false) bildirim üretmez", async () => {
    const submitted = await submitTeacherFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    if (!submitted.ok) return;
    await setTeacherFeedbackSharedTool(ctx({ role: "SCHOOL_ADMIN", studentId: undefined }), {
      feedbackId: submitted.data.feedbackId,
      shared: false,
    });
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t1" });
    expect(notes.some((n) => n.kind === "teacher_feedback_shared")).toBe(false);
  });
});
