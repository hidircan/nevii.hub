import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createFeedbackInviteTool,
  revokeFeedbackInviteTool,
  describeFeedbackInviteTool,
  submitTeacherFeedbackViaInviteTool,
} from "../services/tools";
import { FEEDBACK_INVITES_FILE, createInvite, resolveInvite } from "../feedback-invites";
import { TEACHER_FEEDBACK_FILE_PATH, findTeacherFeedbackThisMonth } from "../teacher-feedback";
import { __resetRateLimitForTests } from "../rate-limit";
import { NOTIFICATIONS_FILE, listNotificationsForUser } from "../notifications";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/** Rapor portalı Task 4 — kişiye özel değerlendirme bağlantısı. */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const DAY = 86_400_000;
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "user_manager_ezgi", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const SCORES = { clarity: 5, communication: 5, effectiveness: 4, motivation: 5, punctuality: 4 };

const codeOf = (url: string) => url.split("/degerlendir/")[1];

beforeEach(async () => {
  for (const f of [DATA_FILE, FEEDBACK_INVITES_FILE, TEACHER_FEEDBACK_FILE_PATH, NOTIFICATIONS_FILE]) {
    await fs.rm(f, { force: true });
  }
  __resetRateLimitForTests();
});

async function newLink(studentId = "s1") {
  const r = await createFeedbackInviteTool(admin, { studentId });
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}

describe("bağlantı üretimi", () => {
  it("yönetici üretir; öğretmen üretemez; düz kod depoda yok", async () => {
    const link = await newLink();
    expect(link.url).toMatch(/\/degerlendir\/[A-Za-z0-9_-]{40,}$/);
    const teacher = await createFeedbackInviteTool({ ...admin, role: "TEACHER", teacherId: "t1" }, { studentId: "s1" });
    expect(teacher.ok).toBe(false);
    const stored = await fs.readFile(FEEDBACK_INVITES_FILE, "utf8");
    expect(stored).not.toContain(codeOf(link.url));
  });

  it("aynı öğrenci için yeni bağlantı eskisini iptal eder; iptal edilen bağlantı Türkçe nedenle reddedilir", async () => {
    const first = await newLink();
    await newLink();
    const d = await describeFeedbackInviteTool(codeOf(first.url));
    expect(d.ok && d.data.status).toBe("revoked");
    if (d.ok && "message" in d.data) expect(d.data.message).toMatch(/iptal/);
  });

  it("süresi dolan bağlantı (15 gün) expired; elle iptal çalışır", async () => {
    const old = await createInvite(DEFAULT_TENANT_ID, "s2", "u", new Date(Date.now() - 15 * DAY));
    expect((await resolveInvite(old.code)).status).toBe("expired");
    const link = await newLink("s3");
    expect((await revokeFeedbackInviteTool(admin, { inviteId: link.inviteId })).ok).toBe(true);
    expect((await resolveInvite(codeOf(link.url))).status).toBe("revoked");
  });

  it("geçersiz kod not_found", async () => {
    const d = await describeFeedbackInviteTool("x".repeat(43));
    expect(d.ok && d.data.status).toBe("not_found");
  });
});

describe("bağlantıyla değerlendirme", () => {
  it("uygun öğretmen bir kez değerlendirilir; kayıt STUDENT_LINK; yöneticiye bildirim; bitince completed", async () => {
    const code = codeOf((await newLink()).url);
    const view = await describeFeedbackInviteTool(code);
    expect(view.ok && view.data.status).toBe("ok");
    const teachers = view.ok && "teachers" in view.data ? view.data.teachers : [];
    expect(teachers.map((t) => t.id)).toContain("t1");

    for (const t of teachers) {
      const r = await submitTeacherFeedbackViaInviteTool(code, { teacherId: t.id, scores: SCORES }, "ip1");
      expect(r.ok).toBe(true);
    }
    const fb = await findTeacherFeedbackThisMonth(DEFAULT_TENANT_ID, "s1", "t1");
    expect(fb?.submitterRole).toBe("STUDENT_LINK");

    const again = await submitTeacherFeedbackViaInviteTool(code, { teacherId: "t1", scores: SCORES }, "ip1");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("CONFLICT");

    const after = await describeFeedbackInviteTool(code);
    expect(after.ok && after.data.status).toBe("completed");

    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_manager_ezgi" });
    expect(notes.some((n) => n.kind === "teacher_feedback_submitted" && n.body.includes("/panel/raporlar"))).toBe(true);
  });

  it("uygun olmayan öğretmen FORBIDDEN", async () => {
    const code = codeOf((await newLink()).url);
    const r = await submitTeacherFeedbackViaInviteTool(code, { teacherId: "t_yok", scores: SCORES }, "ip2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("hız sınırı: aynı istemci + kod 10 denemeden sonra reddedilir", async () => {
    const code = codeOf((await newLink()).url);
    let last;
    for (let i = 0; i < 11; i++) last = await submitTeacherFeedbackViaInviteTool(code, { teacherId: "t_yok", scores: SCORES }, "ip3");
    expect(last && !last.ok && last.error.code).toBe("RATE_LIMITED");
  });
});
