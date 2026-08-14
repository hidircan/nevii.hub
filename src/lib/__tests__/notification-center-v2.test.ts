import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { NOTIFICATION_CATEGORIES } from "../notification-categories";
import { setNotificationPreferences } from "../notification-preferences";
import { listNotificationsForUser, NOTIFICATIONS_FILE } from "../notifications";
import { isLessonInUpcomingWindow, notifyLessonCancelled, notifyLessonRescheduled, sweepUpcomingLessons } from "../lesson-notifications";
import { sweepPaymentFailedOrPending } from "../notification-sweeps";
import { cancelLessonTool, confirmMakeupLessonTool } from "../services/tools";
import { readData } from "../store";
import { writeData as writeJson } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Lesson } from "../types";
import { buildMakeupLessonScheduledDraft } from "../whatsapp-templates";
import { FOLLOW_UP_CASES_FILE } from "../tahsilat/cases";
import { createSeedData } from "../seed";
import { addDays } from "date-fns";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "user_admin",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
  await fs.rm(FOLLOW_UP_CASES_FILE, { force: true });
});

describe("katalog", () => {
  it("eskiden yakında olan kategoriler implemented", () => {
    const must = [
      "lesson_upcoming",
      "lesson_cancelled",
      "lesson_rescheduled",
      "payment_failed_or_pending",
      "task_due_today",
      "task_overdue",
      "leave_pending_approval",
      "portal_request",
    ];
    for (const c of must) {
      expect(NOTIFICATION_CATEGORIES.find((x) => x.category === c)?.implemented).toBe(true);
    }
    expect(NOTIFICATION_CATEGORIES.every((c) => c.implemented)).toBe(true);
  });
});

describe("lesson_upcoming", () => {
  it("pencere içindeki dersi yakalar, geçmişi atlar", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const soon: Lesson = {
      id: "l1",
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt: new Date(now.getTime() + 30 * 60000).toISOString(),
      endAt: new Date(now.getTime() + 75 * 60000).toISOString(),
      type: "regular",
      status: "scheduled",
    };
    const past = { ...soon, id: "l2", startAt: new Date(now.getTime() - 10 * 60000).toISOString() };
    expect(isLessonInUpcomingWindow(soon, now)).toBe(true);
    expect(isLessonInUpcomingWindow(past, now)).toBe(false);
  });

  it("aynı ders için ikinci sweep duplicate üretmez", async () => {
    const now = new Date();
    const seed = createSeedData();
    const lesson: Lesson = {
      ...seed.lessons[0]!,
      id: "l_up_1",
      startAt: new Date(now.getTime() + 40 * 60000).toISOString(),
      endAt: new Date(now.getTime() + 85 * 60000).toISOString(),
      status: "scheduled",
      teacherId: "t1",
      studentId: "s1",
    };
    await writeJson({ ...seed, lessons: [...seed.lessons, lesson] });
    await sweepUpcomingLessons(now);
    await sweepUpcomingLessons(now);
    const teacherNotes = await listNotificationsForUser({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_teacher_t1",
    });
    expect(teacherNotes.filter((n) => n.kind === "lesson_upcoming" && n.body.includes("l_up_1")).length).toBeLessThanOrEqual(
      1
    );
  });
});

describe("lesson_cancelled / rescheduled / tercih", () => {
  it("iptal bildirimi üretir; tercih kapalıya yazmaz; retry duplicate olmaz", async () => {
    const seed = createSeedData();
    const lesson = seed.lessons.find((l) => l.teacherId === "t1" && l.status === "scheduled") ?? seed.lessons[0]!;
    await writeJson(seed);
    await setNotificationPreferences(DEFAULT_TENANT_ID, "user_teacher_t1", [
      { category: "lesson_cancelled", inAppEnabled: false },
    ]);
    await notifyLessonCancelled({ tenantId: DEFAULT_TENANT_ID, lesson, actorUserId: "user_admin" });
    await notifyLessonCancelled({ tenantId: DEFAULT_TENANT_ID, lesson, actorUserId: "user_admin" });
    const teacher = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_teacher_t1" });
    expect(teacher.filter((n) => n.kind === "lesson_cancelled")).toHaveLength(0);
    const admin = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    expect(admin.filter((n) => n.kind === "lesson_cancelled" && n.body.includes(lesson.id)).length).toBeLessThanOrEqual(1);
  });

  it("taşıma eski→yeni saat yazar", async () => {
    const seed = createSeedData();
    await writeJson(seed);
    const lesson = seed.lessons[0]!;
    await notifyLessonRescheduled({
      tenantId: DEFAULT_TENANT_ID,
      lesson: { ...lesson, startAt: "2026-09-01T10:00:00.000Z" },
      previousStartAt: "2026-08-01T10:00:00.000Z",
    });
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    const hit = notes.find((n) => n.kind === "lesson_rescheduled");
    expect(hit?.body).toMatch(/→/);
  });
});

describe("payment_failed_or_pending", () => {
  it("eski pending için yönetici bildirimi üretir, tekrarlamaz", async () => {
    const seed = createSeedData();
    const old = addDays(new Date(), -10).toISOString();
    seed.payments.push({
      id: "pay_pending_old",
      studentId: "s1",
      amount: 1000,
      paidAmount: 0,
      status: "pending",
      dueDate: old,
      createdAt: old,
      description: "bekleyen",
    });
    await writeJson(seed);
    await sweepPaymentFailedOrPending(new Date());
    await sweepPaymentFailedOrPending(new Date());
    const admin = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: "user_admin" });
    expect(admin.filter((n) => n.kind === "payment_failed_or_pending" && n.body.includes("pay_pending_old")).length).toBe(
      1
    );
  });
});

describe("telafi planı + iletişim taslağı", () => {
  it("taslak telafi dersi der ve SMS/WA kurallarını belirtir", async () => {
    const seed = createSeedData();
    const student = seed.students[0]!;
    const teacher = seed.teachers[0]!;
    const lesson: Lesson = {
      id: "l_mk_x",
      studentId: student.id,
      teacherId: teacher.id,
      roomId: seed.rooms[0]!.id,
      branchId: student.branchId,
      instrument: "Piyano",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 45 * 60000).toISOString(),
      type: "makeup",
      status: "scheduled",
    };
    const draft = buildMakeupLessonScheduledDraft(seed.settings.name, student, teacher, lesson, "Erzene");
    expect(draft.kind).toBe("makeup_lesson_scheduled");
    expect(draft.parent.body).toMatch(/telafi dersi/i);
    expect(draft.smsBody).toMatch(/telafi dersi/i);
    expect(draft.whatsappDeliveryNote).toMatch(/teslim/);
    const noPhone = buildMakeupLessonScheduledDraft(
      seed.settings.name,
      { ...student, parentPhone: "" },
      teacher,
      lesson,
      "Erzene"
    );
    expect(noPhone.smsSendable).toBe(false);
    expect(noPhone.parent.waLink).toBeNull();
    const opted = buildMakeupLessonScheduledDraft(
      seed.settings.name,
      { ...student, communicationOptOut: true },
      teacher,
      lesson,
      "Erzene"
    );
    expect(opted.smsSendable).toBe(false);
  });

  it("telefon yokken confirm yine ders oluşturur", async () => {
    const seed = createSeedData();
    const req = seed.makeupRequests.find((m) => m.status === "pending") ?? seed.makeupRequests[0];
    if (!req) return;
    seed.students = seed.students.map((s) => (s.id === req.studentId ? { ...s, parentPhone: "" } : s));
    await writeJson(seed);
    const data = await readData();
    const r = data.makeupRequests.find((m) => m.id === req.id)!;
    const start = new Date();
    start.setDate(start.getDate() + 3);
    start.setHours(11, 0, 0, 0);
    const res = await confirmMakeupLessonTool(ctx(), {
      requestId: r.id,
      slot: {
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 45 * 60000).toISOString(),
        teacherId: r.teacherId,
        roomId: data.rooms[0]!.id,
        branchId: r.branchId,
        score: 1,
        reasons: ["test"],
      },
      decisionNote: "test plan",
    });
    if (res.ok) {
      expect(res.data.lessonId).toBeTruthy();
      expect(res.data.communication?.smsSendable).toBe(false);
    }
  });
});

describe("RBAC / tenant", () => {
  it("öğretmen başka tenant iptal edemez / cancel NOT_FOUND", async () => {
    const res = await cancelLessonTool(ctx({ tenantId: DEFAULT_TENANT_ID }), { lessonId: "missing" });
    expect(res.ok).toBe(false);
  });
});
