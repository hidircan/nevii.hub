import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { submitTeacherFeedbackTool } from "../services/tools";
import { TEACHER_FEEDBACK_FILE_PATH, findTeacherFeedbackThisMonth } from "../teacher-feedback";
import { eligibleFeedbackTeacherIds } from "../teacher-feedback-eligibility";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { NOTIFICATIONS_FILE } from "../notifications";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

/** Rapor portalı Task 1 (docs/superpowers/plans/2026-10-14-report-portal.md). */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-14T12:00:00.000Z");

const student = (teacherId: string, enrollments?: { teacherId: string; active: boolean }[]) =>
  ({ id: "s1", teacherId, enrollments }) as never;
const lesson = (teacherId: string, daysAgo: number) => ({
  studentId: "s1",
  teacherId,
  startAt: new Date(NOW - daysAgo * DAY).toISOString(),
});

describe("eligibleFeedbackTeacherIds", () => {
  it("atanmış + aktif branş + son 90 günde dersi olan öğretmenler; tekil ve sıralı", () => {
    const ids = eligibleFeedbackTeacherIds(
      student("t1", [
        { teacherId: "t3", active: true },
        { teacherId: "t9", active: false },
      ]),
      [lesson("t2", 10), lesson("t2", 20), lesson("t1", 5)],
      NOW
    );
    expect(ids).toEqual(["t1", "t2", "t3"]);
  });

  it("90 günden eski dersin öğretmeni ve başka öğrencinin dersi dahil değil", () => {
    const ids = eligibleFeedbackTeacherIds(student("t1"), [lesson("t4", 91), { ...lesson("t5", 3), studentId: "s2" }], NOW);
    expect(ids).toEqual(["t1"]);
  });
});

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "STUDENT", userId: "u1", tenantId: DEFAULT_TENANT_ID, studentId: "s1", channel: "web", ...overrides };
}
const SCORES = { clarity: 5, communication: 4, effectiveness: 5, motivation: 5, punctuality: 4 };

describe("submitTeacherFeedbackTool — teacherId", () => {
  beforeEach(async () => {
    for (const f of [DATA_FILE, TEACHER_FEEDBACK_FILE_PATH, NOTIFICATIONS_FILE, STUDENT_PORTAL_ACCESS_FILE]) {
      await fs.rm(f, { force: true });
    }
    await grantStudentAccess({ tenantId: DEFAULT_TENANT_ID, userId: "u1" }, "s1", "SELF");
    const { readData } = await import("../store");
    const { writeData } = await import("../store-json");
    const data = await readData();
    const base = data.lessons.find((l) => l.studentId === "s1") ?? data.lessons[0];
    await writeData({
      ...data,
      lessons: [
        ...data.lessons,
        {
          ...base,
          id: "l_t2_recent",
          studentId: "s1",
          teacherId: "t2",
          startAt: new Date(Date.now() - 10 * DAY).toISOString(),
          endAt: new Date(Date.now() - 10 * DAY + 40 * 60_000).toISOString(),
        },
      ],
    });
  });

  it("uygun ikinci öğretmen (son 90 günde ders) seçilince kayıt O öğretmene yazılır", async () => {
    const r = await submitTeacherFeedbackTool(ctx(), { studentId: "s1", teacherId: "t2", scores: SCORES });
    expect(r.ok).toBe(true);
    expect(await findTeacherFeedbackThisMonth(DEFAULT_TENANT_ID, "s1", "t2")).not.toBeNull();
    expect(await findTeacherFeedbackThisMonth(DEFAULT_TENANT_ID, "s1", "t1")).toBeNull();
  });

  it("uygun olmayan öğretmen → FORBIDDEN, Türkçe nedenli mesaj", async () => {
    const r = await submitTeacherFeedbackTool(ctx(), { studentId: "s1", teacherId: "t4", scores: SCORES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("FORBIDDEN");
      expect(r.error.message).toMatch(/öğretmen/i);
    }
  });

  it("teacherId verilmezse eski davranış: atanmış öğretmen", async () => {
    const r = await submitTeacherFeedbackTool(ctx(), { studentId: "s1", scores: SCORES });
    expect(r.ok).toBe(true);
    expect(await findTeacherFeedbackThisMonth(DEFAULT_TENANT_ID, "s1", "t1")).not.toBeNull();
  });
});
