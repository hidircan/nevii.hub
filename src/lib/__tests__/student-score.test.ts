/**
 * Öğrenci skor motoru uçtan uca testleri — teacher-performance-v2.test.ts
 * ile aynı desen (gerçek store'a fixture yazıp computeStudentScore'u
 * çağırma). Yoklama fixture'ları için seed dersi "l8" şablon olarak
 * klonlanır (roomId/branchId/instrument/type gibi zorunlu alanlar için).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { readData as readDataRaw, writeData as writeDataRaw } from "../store-json";
import { computeStudentScore, scoreBand, STUDENT_SCORE_WEIGHTS } from "../student-score";
import { createHomework, submitHomework, HOMEWORK_FILE_PATH, HOMEWORK_SUBMISSIONS_FILE_PATH } from "../homework";
import { createCurriculumTopic, CURRICULUM_TOPICS_FILE } from "../curriculum";
import { createAssessment, LESSON_ASSESSMENTS_FILE } from "../assessment";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { Lesson } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(HOMEWORK_FILE_PATH, { force: true });
  await fs.rm(HOMEWORK_SUBMISSIONS_FILE_PATH, { force: true });
  await fs.rm(CURRICULUM_TOPICS_FILE, { force: true });
  await fs.rm(LESSON_ASSESSMENTS_FILE, { force: true });
});

const PERIOD_START = "2020-01-01";
const PERIOD_END = "2030-12-31"; // testler için geniş bir pencere — tarih filtrelemesi ayrı test edilir

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Seed dersi "l8"yi şablon alarak yeni bir ders satırı ekler — zorunlu alanlar için. */
async function addLessonFor(studentId: string, startAt: string, opsFlags: Partial<Lesson> = {}): Promise<void> {
  const data = await readDataRaw();
  const template = data.lessons.find((l) => l.id === "l8");
  if (!template) throw new Error("seed lesson l8 not found");
  const lesson: Lesson = {
    ...template,
    id: `test-${Math.random().toString(36).slice(2)}`,
    studentId,
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 45 * 60_000).toISOString(),
    status: "completed",
    studentAttended: undefined,
    studentAbsent: undefined,
    studentExcused: undefined,
    opsMakeupFlag: undefined,
    lessonProcessed: undefined,
    ...opsFlags,
  };
  await writeDataRaw({ ...data, lessons: [...data.lessons, lesson] });
}

describe("computeStudentScore — bileşen davranışları", () => {
  it("hiçbir veri yoksa toplam skor null döner (Yetersiz veri) — punitif bir 0 DEĞİL", async () => {
    const data = await readDataRaw();
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, "s1", PERIOD_START, PERIOD_END);
    expect(report.score).toBeNull();
    expect(scoreBand(report.score)).toBe("insufficient_data");
  });

  it("yoklama: geldi/işlendi olumlu, gelmedi olumsuz, mazeretli/telafi/işaretlenmemiş sayılmaz", async () => {
    // Seed'de "s1" için zaten dersler var (broad pencereyle çakışabilir) — bu
    // testin sayaçları tam kontrol etmesi gerektiğinden hayali/temiz bir
    // studentId kullanılır (computeAttendanceComponent yalnızca data.lessons
    // okur, data.students'a karşı doğrulamaz).
    const studentId = "test-student-attendance-only";
    await addLessonFor(studentId, isoDaysFromNow(-1), { studentAttended: true });
    await addLessonFor(studentId, isoDaysFromNow(-2), { lessonProcessed: true });
    await addLessonFor(studentId, isoDaysFromNow(-3), { studentAbsent: true });
    await addLessonFor(studentId, isoDaysFromNow(-4), { studentExcused: true }); // cezalandırılmaz
    await addLessonFor(studentId, isoDaysFromNow(-5), { opsMakeupFlag: true }); // cezalandırılmaz
    await addLessonFor(studentId, isoDaysFromNow(-6)); // hiç işaretlenmemiş — cezalandırılmaz

    const data = await readDataRaw();
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, studentId, PERIOD_START, PERIOD_END);
    const att = report.components.attendance;
    expect(att.attendedCount).toBe(2);
    expect(att.absentCount).toBe(1);
    expect(att.excusedOrMakeupCount).toBe(2);
    expect(att.unmarkedCount).toBe(1);
    expect(att.countedLessonCount).toBe(3); // yalnızca geldi+gelmedi paydada
    expect(att.rawValue).toBeCloseTo(2 / 3, 5);
    expect(att.hasData).toBe(true);
  });

  it("ödev: teslim edilmeyen tamamlanmamış sayılır; geç teslim tamamlanmış ama zamanında DEĞİL sayılır", async () => {
    const onTime = await createHomework({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      title: "Zamanında",
      description: "",
      dueDate: isoDaysFromNow(5),
    });
    await submitHomework({ tenantId: DEFAULT_TENANT_ID, homeworkId: onTime.id, studentId: "s1" });

    const late = await createHomework({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      title: "Geç",
      description: "",
      dueDate: isoDaysFromNow(-5),
    });
    await submitHomework({ tenantId: DEFAULT_TENANT_ID, homeworkId: late.id, studentId: "s1" });

    await createHomework({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId: "s1",
      title: "Hiç teslim edilmedi",
      description: "",
      dueDate: isoDaysFromNow(-1),
    });

    const data = await readDataRaw();
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, "s1", PERIOD_START, PERIOD_END);
    const hw = report.components.homework;
    expect(hw.totalCount).toBe(3);
    expect(hw.completedCount).toBe(2);
    expect(hw.onTimeCount).toBe(1);
    expect(hw.completionRate).toBeCloseTo(2 / 3, 5);
    expect(hw.onTimeRate).toBeCloseTo(1 / 3, 5);
    // normalizedValue onTimeRate'i önceliklendirir (tasks bileşeniyle aynı desen)
    expect(hw.normalizedValue).toBeCloseTo((1 / 3) * 100, 3);
  });

  it("müfredat: dönem penceresinden BAĞIMSIZ, öğrencinin güncel tüm konularının progressPercent ortalamasıdır", async () => {
    await createCurriculumTopic({
      tenantId: DEFAULT_TENANT_ID,
      studentId: "s1",
      teacherId: "t1",
      title: "Gam çalışması",
      status: "mastered",
      progressPercent: 100,
      createdBy: "u1",
    });
    await createCurriculumTopic({
      tenantId: DEFAULT_TENANT_ID,
      studentId: "s1",
      teacherId: "t1",
      title: "Arpej",
      status: "in_progress",
      progressPercent: 40,
      createdBy: "u1",
    });

    const data = await readDataRaw();
    // Çok dar (geçmişte kalan) bir pencere veriyoruz — müfredat yine de tam hesaba katılmalı.
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, "s1", "1999-01-01", "1999-01-02");
    const curriculum = report.components.curriculum;
    expect(curriculum.hasData).toBe(true);
    expect(curriculum.topicCount).toBe(2);
    expect(curriculum.normalizedValue).toBeCloseTo(70, 5); // (100+40)/2
  });

  it("öğretmen değerlendirmesi: 1-5 ölçeği 0-100'e taşınır, dönem dışı değerlendirme sayılmaz", async () => {
    await createAssessment({
      tenantId: DEFAULT_TENANT_ID,
      lessonId: "l8",
      studentId: "s1",
      teacherId: "t1",
      teknikBecerisi: 5,
      notaOkuma: 5,
      muzikalite: 5,
      ritimDuyusu: 5,
      calismaDuzeni: 5,
      evOdeviTamamlama: 5,
      dersKatilimi: 5,
      motivasyon: 5,
      genelIlerleme: 5,
      hedefeUlasma: 5,
      strengthNote: "—",
      nextStepsNote: "—",
      improvementNote: "—",
      teacherSignedName: "Test Öğretmen",
    });

    const data = await readDataRaw();
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, "s1", PERIOD_START, PERIOD_END);
    const assessment = report.components.teacherAssessment;
    expect(assessment.hasData).toBe(true);
    expect(assessment.assessmentCount).toBe(1);
    expect(assessment.normalizedValue).toBeCloseTo(100, 5); // (5-1)/4*100

    const outOfWindow = await computeStudentScore(data, DEFAULT_TENANT_ID, "s1", "1999-01-01", "1999-01-02");
    expect(outOfWindow.components.teacherAssessment.hasData).toBe(false);
  });

  it("tek bir anlamlı bileşen YETERSİZ sayılır — skor null döner, tek veri noktasından yanıltıcı kesinlik üretilmez", async () => {
    // Yalnızca yoklama verisi var (%100 devam) — diğer 3 bileşen verisiz.
    // Temiz bir studentId — homework/curriculum/assessment zaten bu id için
    // hiç kayıt içermeyecek (yeni store'lar), ama seed'in "s1" ders geçmişiyle
    // karışmasın diye burada da hayali bir id kullanılır.
    const studentId = "test-student-missing-components";
    await addLessonFor(studentId, isoDaysFromNow(-1), { studentAttended: true });

    const data = await readDataRaw();
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, studentId, PERIOD_START, PERIOD_END);
    expect(report.components.attendance.hasData).toBe(true);
    expect(report.components.homework.hasData).toBe(false);
    expect(report.components.curriculum.hasData).toBe(false);
    expect(report.components.teacherAssessment.hasData).toBe(false);
    expect(report.score).toBeNull();
    expect(scoreBand(report.score)).toBe("insufficient_data");
    // Tek bileşen olsa bile contribution ASLA set edilmez (yanıltıcı kısmi sayı üretilmez).
    expect(report.components.attendance.contribution).toBeNull();
  });

  it("eksik bileşenler skoru CEZALANDIRMAZ — İKİ (veya daha fazla) anlamlı bileşen varsa ağırlıklar aralarında yeniden dağıtılır", async () => {
    // Yoklama (%100) + ödev (%100 zamanında) — curriculum/teacherAssessment verisiz.
    // Onaylı ağırlıklarla (0.30/0.25) yeniden normalize: 0.30/(0.30+0.25)=0.5455, 0.25/0.55=0.4545 — ikisi de %100 olduğundan skor yine 100 olur.
    const studentId = "test-student-two-components";
    await addLessonFor(studentId, isoDaysFromNow(-1), { studentAttended: true });
    const hw = await createHomework({
      tenantId: DEFAULT_TENANT_ID,
      teacherId: "t1",
      studentId,
      title: "Zamanında",
      description: "",
      dueDate: isoDaysFromNow(5),
    });
    await submitHomework({ tenantId: DEFAULT_TENANT_ID, homeworkId: hw.id, studentId });

    const data = await readDataRaw();
    const report = await computeStudentScore(data, DEFAULT_TENANT_ID, studentId, PERIOD_START, PERIOD_END);
    expect(report.components.attendance.hasData).toBe(true);
    expect(report.components.homework.hasData).toBe(true);
    expect(report.components.curriculum.hasData).toBe(false);
    expect(report.components.teacherAssessment.hasData).toBe(false);
    expect(report.score).toBe(100);
    expect(report.components.attendance.contribution).toBeCloseTo(300 / 5.5, 1);
    expect(report.components.homework.contribution).toBeCloseTo(250 / 5.5, 1);
  });

  it("onaylanmış ağırlıklar: yoklama %30, ödev %25, müfredat %20, öğretmen değerlendirmesi %25 — eşit dağılım DEĞİL", () => {
    expect(STUDENT_SCORE_WEIGHTS).toEqual({
      attendance: 0.3,
      homework: 0.25,
      curriculum: 0.2,
      teacherAssessment: 0.25,
    });
    const total = Object.values(STUDENT_SCORE_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});
