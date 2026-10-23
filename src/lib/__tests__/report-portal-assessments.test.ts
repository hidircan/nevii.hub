import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createAssessmentTool, createPeriodicAssessmentTool, listPendingPeriodicAssessmentsTool } from "../services/tools";
import { LESSON_ASSESSMENTS_FILE, listAssessmentsForStudent } from "../assessment";
import { PERIODIC_ASSESSMENTS_FILE } from "../periodic-assessment";
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
  it("ikinci branş öğretmeni kendi dersini kapsayan dönemi gönderir; kayıt O öğretmene, yöneticiye bildirim", async () => {
    const at = Date.now() - 3 * DAY;
    const r = await createPeriodicAssessmentTool(teacher("t2"), {
      studentId: "s1",
      periodStart: new Date(at - DAY).toISOString(),
      periodEnd: new Date(at).toISOString(),
      overallProgressNote: "Düzenli ilerliyor",
    });
    expect(r.ok).toBe(true);
    const notes = await listNotificationsForUser({ tenantId: DEFAULT_TENANT_ID, userId: ADMIN_USER });
    expect(notes.some((n) => n.kind === "periodic_assessment_submitted")).toBe(true);
  });

  it("öğretmenin dersi olmayan aralık reddedilir (anlaşılır mesaj)", async () => {
    const r = await createPeriodicAssessmentTool(teacher("t2"), {
      studentId: "s1",
      periodStart: new Date(Date.now() - 60 * DAY).toISOString(),
      periodEnd: new Date(Date.now() - 50 * DAY).toISOString(),
      overallProgressNote: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("dersiniz görünmüyor");
  });
});

describe("4 haftalık rapor — liste ile gönderim aynı dönemi kabul eder (veri kaybı regresyonu)", () => {
  /** Eski hata: liste 120 günlük pencereden, gönderim tüm geçmişten 4'lü grup kurduğu için sınırlar kayıyor ve
   *  uzun geçmişi olan öğrencide öğretmenin yazdığı rapor "bekleyen dönem değil" diye reddediliyordu. */
  beforeEach(async () => {
    const { readData } = await import("../store");
    const { writeData } = await import("../store-json");
    const data = await readData();
    const base = data.lessons.find((l) => l.id === "l_t2")!;
    // 200 günden bugüne haftalık 29 ders (+ beforeEach'teki l_t2): 4'e bölünmeyen uzun geçmiş.
    const extra = Array.from({ length: 29 }, (_, k) => {
      const start = Date.now() - (200 - k * 7) * DAY;
      return { ...base, id: `l_t2_${k}`, startAt: new Date(start).toISOString(), endAt: new Date(start + 40 * 60_000).toISOString() };
    });
    await writeData({ ...data, lessons: [...data.lessons, ...extra] });
  });

  it("listedeki dönem gönderilir, sonra listeden düşer; aynı metinle tekrar gönderim aynı kaydı döner", async () => {
    const list = await listPendingPeriodicAssessmentsTool(teacher("t2"), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const item = list.data.items.find((i) => i.studentId === "s1");
    expect(item).toBeDefined();
    expect(item!.lessonCount).toBe(4);
    expect(list.data.items.filter((i) => i.studentId === "s1")).toHaveLength(1);

    const body = { studentId: "s1", periodStart: item!.periodStart, periodEnd: item!.periodEnd, overallProgressNote: "İyi gidiyor" };
    const first = await createPeriodicAssessmentTool(teacher("t2"), body);
    expect(first.ok).toBe(true);
    const retry = await createPeriodicAssessmentTool(teacher("t2"), body);
    expect(retry.ok && first.ok && retry.data.id === first.data.id).toBe(true);
    const changed = await createPeriodicAssessmentTool(teacher("t2"), { ...body, overallProgressNote: "Başka metin" });
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.error.code).toBe("CONFLICT");

    const after = await listPendingPeriodicAssessmentsTool(teacher("t2"), { studentId: "s1" });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    // Sonraki dönem varsa yalnız gönderilenin BİTİŞİNDEN sonra başlar ve taslağı tek öğrenci isteğinde gelir.
    for (const next of after.data.items) {
      expect(next.periodStart > item!.periodEnd).toBe(true);
      expect(next.draft).toBeDefined();
    }
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
