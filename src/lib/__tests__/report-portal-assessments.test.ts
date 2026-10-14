import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createAssessmentTool, createPeriodicAssessmentTool } from "../services/tools";
import { LESSON_ASSESSMENTS_FILE, listAssessmentsForStudent } from "../assessment";
import { PERIODIC_ASSESSMENTS_FILE, computePendingPeriodicAssessmentPeriods } from "../periodic-assessment";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { NOTIFICATIONS_FILE, listNotificationsForUser } from "../notifications";

/** Rapor portalı Task 2 — dar okuma, doğru öğretmen (çoklu branş), yönetici bildirimi. */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const DAY = 86_400_000;
const ADMIN_USER = "user_manager_ezgi";

const teacher = (teacherId: string): ServiceContext => ({
  role: "TEACHER",
  userId: `u_${teacherId}`,
  tenantId: DEFAULT_TENANT_ID,
  teacherId,
  channel: "web",
});

const ASSESSMENT = {
  studentId: "s1",
  teknikBecerisi: 4, notaOkuma: 4, muzikalite: 5, ritimDuyusu: 4, calismaDuzeni: 3,
  evOdeviTamamlama: 4, dersKatilimi: 5, motivasyon: 5, genelIlerleme: 4, hedefeUlasma: 4,
  strengthNote: "Ritim duygusu güçlü", nextStepsNote: "Gam çalışması", improvementNote: "Nota okuma",
  teacherSignedName: "Öğretmen",
};

beforeEach(async () => {
  for (const f of [DATA_FILE, LESSON_ASSESSMENTS_FILE, PERIODIC_ASSESSMENTS_FILE, NOTIFICATIONS_FILE]) {
    await fs.rm(f, { force: true });
  }
  const { readData } = await import("../store");
  const { writeData } = await import("../store-json");
  const data = await readData();
  const base = data.lessons.find((l) => l.studentId === "s1") ?? data.lessons[0];
  const s1 = data.students.find((s) => s.id === "s1")!;
  await writeData({
    ...data,
    students: data.students.map((s) =>
      s.id === "s1"
        ? {
            ...s,
            firstLessonAt: new Date(Date.now() - 40 * DAY).toISOString(),
            enrollments: [
              ...(s1.enrollments ?? []),
              { ...(s1.enrollments?.[0] ?? {}), id: "enr_t2", teacherId: "t2", active: true, instrument: "Gitar" } as never,
            ],
          }
        : s
    ),
    lessons: [
      ...data.lessons,
      {
        ...base,
        id: "l_t2",
        studentId: "s1",
        teacherId: "t2",
        status: "completed",
        startAt: new Date(Date.now() - 3 * DAY).toISOString(),
        endAt: new Date(Date.now() - 3 * DAY + 40 * 60_000).toISOString(),
      },
    ],
  });
});

describe("createAssessmentTool", () => {
  it("ikinci branş öğretmeni kendi dersine yazınca kayıt O öğretmene atfedilir", async () => {
    const r = await createAssessmentTool(teacher("t2"), { ...ASSESSMENT, lessonId: "l_t2" });
    expect(r.ok).toBe(true);
    const rows = await listAssessmentsForStudent(DEFAULT_TENANT_ID, "s1");
    expect(rows.find((a) => a.lessonId === "l_t2")?.teacherId).toBe("t2");
  });

  it("başka öğretmenin dersine yazamaz (FORBIDDEN)", async () => {
    const r = await createAssessmentTool(teacher("t3"), { ...ASSESSMENT, lessonId: "l_t2" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("başarıda yöneticiye bildirim gider, Raporlar ekranına yönlendirir", async () => {
    const r = await createAssessmentTool(teacher("t2"), { ...ASSESSMENT, lessonId: "l_t2" });
    expect(r.ok).toBe(true);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: ADMIN_USER });
    const note = notes.find((n) => n.kind === "lesson_assessment_submitted");
    expect(note).toBeDefined();
    expect(note!.body).toContain("/panel/raporlar");
  });
});

describe("createPeriodicAssessmentTool", () => {
  it("ikinci branş öğretmeni bekleyen dönemi gönderir; kayıt O öğretmene, yöneticiye bildirim", async () => {
    const { readData } = await import("../store");
    const s1 = (await readData()).students.find((s) => s.id === "s1")!;
    const [period] = computePendingPeriodicAssessmentPeriods(s1, []);
    expect(period).toBeDefined();
    const r = await createPeriodicAssessmentTool(teacher("t2"), {
      studentId: "s1",
      ...period,
      overallProgressNote: "Düzenli ilerliyor",
    });
    expect(r.ok).toBe(true);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: ADMIN_USER });
    expect(notes.some((n) => n.kind === "periodic_assessment_submitted")).toBe(true);
  });
});

describe("kota kilidi", () => {
  it("iki rapor aracı tam okuma yapmaz", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/services/tools.ts"), "utf8");
    for (const name of ["createAssessmentTool", "createPeriodicAssessmentTool"]) {
      const start = src.indexOf(`export async function ${name}(`);
      const end = src.indexOf("\nexport ", start + 10);
      expect(src.slice(start, end)).not.toMatch(/\breadData\s*\(/);
    }
  });
});
