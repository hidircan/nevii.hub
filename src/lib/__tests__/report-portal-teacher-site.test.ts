import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { pendingLessonAssessments } from "../reports/pending";
import { LESSON_ASSESSMENTS_FILE, createAssessment, listAssessedLessonIds } from "../assessment";
import { DEFAULT_TENANT_ID } from "../auth/config";

/** Rapor portalı Task 5 — `/gelisim` öğretmen sitesi. */
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const lesson = (id: string, daysAgo: number, over: Partial<{ teacherId: string; status: string; studentId: string }> = {}) => ({
  id,
  studentId: over.studentId ?? "s1",
  teacherId: over.teacherId ?? "t1",
  status: (over.status ?? "completed") as "completed",
  startAt: new Date(NOW - daysAgo * DAY).toISOString(),
});

describe("pendingLessonAssessments", () => {
  it("son 14 gün, geçmiş, kendi, iptal/gelmedi değil, raporsuz; en yeni önce", () => {
    const rows = pendingLessonAssessments(
      [
        lesson("a", 2),
        lesson("b", 10),
        lesson("eski", 15),
        lesson("gelecek", -1),
        lesson("baskasi", 3, { teacherId: "t2" }),
        lesson("iptal", 4, { status: "cancelled" }),
        lesson("gelmedi", 5, { status: "no_show" }),
        lesson("raporlu", 6),
        lesson("ogrencisiz", 7, { studentId: "" }),
      ],
      new Set(["raporlu"]),
      "t1",
      NOW
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("teacherId null → tüm öğretmenler (yönetici sayacı)", () => {
    const rows = pendingLessonAssessments([lesson("a", 1), lesson("x", 1, { teacherId: "t2" })], new Set(), null, NOW);
    expect(rows).toHaveLength(2);
  });
});

describe("listAssessedLessonIds", () => {
  beforeEach(async () => {
    await fs.rm(LESSON_ASSESSMENTS_FILE, { force: true });
  });
  it("yalnız verilen derslerden raporlu olanları döner", async () => {
    await createAssessment({
      tenantId: DEFAULT_TENANT_ID, lessonId: "l1", studentId: "s1", teacherId: "t1",
      teknikBecerisi: 3, notaOkuma: 3, muzikalite: 3, ritimDuyusu: 3, calismaDuzeni: 3, evOdeviTamamlama: 3,
      dersKatilimi: 3, motivasyon: 3, genelIlerleme: 3, hedefeUlasma: 3,
      strengthNote: "a", nextStepsNote: "b", improvementNote: "c", teacherSignedName: "T",
    } as never);
    const set = await listAssessedLessonIds(DEFAULT_TENANT_ID, ["l1", "l2"]);
    expect([...set]).toEqual(["l1"]);
    expect((await listAssessedLessonIds("baska_kurum", ["l1"])).size).toBe(0);
  });
});

describe("kaynak sözleşmesi", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  it.each(["src/app/gelisim/page.tsx", "src/app/gelisim/[studentId]/page.tsx"])("%s tam okuma yapmaz, indekslenmez", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/\breadData\s*\(|\breadScopedData\s*\(/);
    expect(src).toMatch(/robots: \{ index: false \}/);
  });
  it("öğrenci sayfası sahiplik kontrolünden geçmeyen öğrenciye form göstermez", () => {
    const src = read("src/app/gelisim/[studentId]/page.tsx");
    const guard = src.indexOf("!isOwnStudent(student, teacherId)");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(src.indexOf("<LessonAssessmentMobileForm"));
  });
  it("middleware /gelisim'i korur", () => {
    const src = read("src/middleware.ts");
    expect(src).toMatch(/const PROTECTED = \[[^\]]*"\/gelisim"/);
    expect(src).toContain('"/gelisim/:path*"');
  });
});
