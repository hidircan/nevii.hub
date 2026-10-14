import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { LESSON_ASSESSMENTS_FILE, createAssessment, listAssessmentsPage } from "../assessment";
import { listLessonAssessmentsForAdminTool, getReportsOverviewTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/** Rapor portalı Task 7 — yönetici "Raporlar" ekranı. */
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "user_manager_ezgi", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const teacher: ServiceContext = { role: "TEACHER", userId: "u_t1", tenantId: DEFAULT_TENANT_ID, teacherId: "t1", channel: "web" };
const FROM = "2000-01-01T00:00:00.000Z";
const TO = "2100-01-01T00:00:00.000Z";

const base = {
  tenantId: DEFAULT_TENANT_ID, studentId: "s1",
  teknikBecerisi: 3, notaOkuma: 3, muzikalite: 3, ritimDuyusu: 3, calismaDuzeni: 3, evOdeviTamamlama: 3,
  dersKatilimi: 3, motivasyon: 3, genelIlerleme: 3, hedefeUlasma: 3,
  strengthNote: "a", nextStepsNote: "b", improvementNote: "c", teacherSignedName: "T",
};

beforeEach(async () => {
  await fs.rm(LESSON_ASSESSMENTS_FILE, { force: true });
  for (let i = 0; i < 7; i++) {
    await createAssessment({ ...base, lessonId: `l${i}`, teacherId: i < 5 ? "t1" : "t2" } as never);
  }
});

describe("listAssessmentsPage", () => {
  it("filtre + sayfa + toplam", async () => {
    const p1 = await listAssessmentsPage(DEFAULT_TENANT_ID, { teacherId: "t1", fromIso: FROM, toIso: TO, page: 1, pageSize: 2 });
    expect(p1.total).toBe(5);
    expect(p1.rows).toHaveLength(2);
    const p3 = await listAssessmentsPage(DEFAULT_TENANT_ID, { teacherId: "t1", fromIso: FROM, toIso: TO, page: 3, pageSize: 2 });
    expect(p3.rows).toHaveLength(1);
    const none = await listAssessmentsPage(DEFAULT_TENANT_ID, { fromIso: "2099-01-01T00:00:00.000Z", toIso: TO, page: 1, pageSize: 10 });
    expect(none.total).toBe(0);
    expect((await listAssessmentsPage("baska", { fromIso: FROM, toIso: TO, page: 1, pageSize: 10 })).total).toBe(0);
  });
});

describe("yönetici araçları — rol", () => {
  it("öğretmen raporlar listesini ve genel bakışı göremez", async () => {
    const list = await listLessonAssessmentsForAdminTool(teacher, { from: FROM, to: TO });
    expect(list.ok).toBe(false);
    if (!list.ok) expect(list.error.code).toBe("FORBIDDEN");
    expect((await getReportsOverviewTool(teacher)).ok).toBe(false);
  });
  it("yönetici görür", async () => {
    const list = await listLessonAssessmentsForAdminTool(admin, { from: FROM, to: TO, page: 1, pageSize: 5 });
    expect(list.ok && list.data.total).toBe(7);
    expect((await getReportsOverviewTool(admin)).ok).toBe(true);
  });
});

describe("kaynak sözleşmesi", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  it("Raporlar sayfası tam okuma yapmaz, öğrenci değerlendirmelerini MASKELİ araçla okur", () => {
    const src = read("src/app/panel/raporlar/page.tsx");
    expect(src).not.toMatch(/\breadData\s*\(|\breadScopedData\s*\(/);
    expect(src).toContain("listTeacherFeedbackForReviewTool");
    expect(src).not.toMatch(/listTeacherFeedbackTool\b/);
  });
  it("menüde Raporlar var", () => {
    expect(read("src/lib/nav/panel-nav.ts")).toContain('href: "/panel/raporlar"');
  });
});
