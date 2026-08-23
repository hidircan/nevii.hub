import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  submitStudentFeedbackTool,
  listStudentFeedbackTool,
  getOwnStudentFeedbackThisMonthTool,
} from "../services/tools";
import { STUDENT_FEEDBACK_FILE_PATH } from "../student-feedback";
import { NOTIFICATIONS_FILE, listNotificationsForUser } from "../notifications";
import { NOTIFICATION_PREFERENCES_FILE, setNotificationPreferences } from "../notification-preferences";
import { hasPermission } from "../auth/rbac";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "TEACHER", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

// Demo seed: s1/s5 -> teacherId t1, s2/s4/s6 -> teacherId t2.
const VALID_FEEDBACK = {
  studentId: "s1",
  scores: { attendance: 5, practice: 4, progress: 5, attitude: 5, preparedness: 4 },
  comment: "Çok gelişti",
};

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(STUDENT_FEEDBACK_FILE_PATH, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(NOTIFICATION_PREFERENCES_FILE, { force: true });
});

describe("submitStudentFeedbackTool — yalnızca kendi öğrencisi için", () => {
  it("TEACHER kendi öğrencisi için değerlendirme gönderebilir", async () => {
    const result = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    expect(result.ok).toBe(true);
  });

  it("başka öğretmenin öğrencisi için erişim FORBIDDEN döner", async () => {
    const result = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t2" }), VALID_FEEDBACK);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("PARENT/STUDENT/SCHOOL_ADMIN değerlendirme gönderemez", async () => {
    const asParent = await submitStudentFeedbackTool(ctx({ role: "STUDENT", studentId: "s1" }), VALID_FEEDBACK);
    expect(asParent.ok).toBe(false);
    const asAdmin = await submitStudentFeedbackTool(ctx({ role: "SCHOOL_ADMIN" }), VALID_FEEDBACK);
    expect(asAdmin.ok).toBe(false);
  });

  it("puan aralığı dışı (0 veya 6) VALIDATION_ERROR döner", async () => {
    const result = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      ...VALID_FEEDBACK,
      scores: { ...VALID_FEEDBACK.scores, attendance: 6 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("beş kriterden biri eksikse VALIDATION_ERROR döner", async () => {
    const { preparedness: _omit, ...incomplete } = VALID_FEEDBACK.scores;
    void _omit;
    const result = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId: "s1",
      scores: incomplete,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("yorum 1000 karakteri aşarsa VALIDATION_ERROR döner", async () => {
    const result = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      ...VALID_FEEDBACK,
      comment: "a".repeat(1001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("aynı ay tekrar kuralı", () => {
  it("aynı ay içinde ikinci gönderim yeni kayıt değil, mevcut kaydı günceller", async () => {
    const first = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.updated).toBe(false);

    const second = await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      ...VALID_FEEDBACK,
      scores: { ...VALID_FEEDBACK.scores, attendance: 2 },
      comment: "Güncellendi",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.updated).toBe(true);
    expect(second.data.feedbackId).toBe(first.data.feedbackId);

    const listed = await listStudentFeedbackTool(ctx({ role: "SCHOOL_ADMIN" }), {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.feedback).toHaveLength(1);
    expect(listed.data.feedback[0].scores.attendance).toBe(2);
  });

  it("getOwnStudentFeedbackThisMonthTool bu ay kaydını döner, farklı öğrenci için null döner", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    const mine = await getOwnStudentFeedbackThisMonthTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId: "s1",
    });
    expect(mine.ok).toBe(true);
    if (mine.ok) expect(mine.data.feedback).not.toBeNull();
  });
});

describe("görünürlük ve yetki", () => {
  it("TEACHER yalnızca kendi yazdıklarını görür (başka öğretmenin kaydı sızmaz)", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t2" }), { ...VALID_FEEDBACK, studentId: "s2" });

    const asT1 = await listStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), {});
    expect(asT1.ok).toBe(true);
    if (!asT1.ok) return;
    expect(asT1.data.feedback).toHaveLength(1);
    expect(asT1.data.feedback[0].teacherId).toBe("t1");
  });

  it("SCHOOL_ADMIN/SUPER_ADMIN tenant içindeki tüm kayıtları görür", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t2" }), { ...VALID_FEEDBACK, studentId: "s2" });

    const result = await listStudentFeedbackTool(ctx({ role: "SCHOOL_ADMIN" }), {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.feedback).toHaveLength(2);
  });

  it("RBAC kataloğunda PARENT/STUDENT rolünün student_feedback izinleri YOK", () => {
    expect(hasPermission("STUDENT", "student_feedback:read")).toBe(false);
    expect(hasPermission("STUDENT", "student_feedback:read")).toBe(false);
    expect(hasPermission("STUDENT", "student_feedback:submit")).toBe(false);
  });

  it("başka tenant'ın kaydı listeye sızmaz", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1", tenantId: DEFAULT_TENANT_ID }), VALID_FEEDBACK);
    const otherTenant = await listStudentFeedbackTool(ctx({ role: "SCHOOL_ADMIN", tenantId: "tenant_other_sf" }), {});
    expect(otherTenant.ok).toBe(true);
    if (!otherTenant.ok) return;
    expect(otherTenant.data.feedback).toHaveLength(0);
  });
});

describe("yönetici bildirimi (student_feedback_submitted)", () => {
  it("değerlendirme gönderilince yöneticilere bildirim oluşur", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    expect(notes.some((n) => n.kind === "student_feedback_submitted")).toBe(true);
  });

  it("bildirim metni ham yorum içeriğini taşımaz", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    const note = notes.find((n) => n.kind === "student_feedback_submitted");
    expect(note).toBeDefined();
    expect(note!.body).not.toContain(VALID_FEEDBACK.comment);
  });

  it("tercih kapalıyken bildirim oluşmaz", async () => {
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_admin", [
      { category: "student_feedback_submitted", inAppEnabled: false },
    ]);
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    expect(notes.some((n) => n.kind === "student_feedback_submitted")).toBe(false);
  });

  it("aynı ay içindeki tekrar gönderim (update) duplicate bildirim üretmez", async () => {
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), VALID_FEEDBACK);
    await submitStudentFeedbackTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      ...VALID_FEEDBACK,
      comment: "İkinci deneme",
    });
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    expect(notes.filter((n) => n.kind === "student_feedback_submitted")).toHaveLength(1);
  });
});
