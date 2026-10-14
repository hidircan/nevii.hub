/**
 * 2026-10-10 — Çoklu branş v2 (her branş eşit ve bağımsız): SAF çekirdek davranışları.
 * Store/DB gerektirmez; paylaşılan form doğrulaması, branş değişikliğinin izolasyonu, MEB satırlarının branşa göre açılması
 * ve belirsiz hedefte yazımın reddi.
 */
import { describe, expect, it } from "vitest";
import { applyEnrollmentChange, enrollmentTerms, routeTermPatch } from "../student-enrollments";
import { emptyEnrollmentDraft, validateEnrollmentDraft, validateEnrollmentDrafts } from "../enrollment-form";
import { mebRowsForStudent } from "../meb-list";
import type { Student, StudentEnrollment } from "../types";

const NOW = "2026-10-01T09:00:00.000Z";

function record(over: Partial<StudentEnrollment> & Pick<StudentEnrollment, "id" | "instrument">): StudentEnrollment {
  return {
    teacherId: `t-${over.id}`,
    lessonDurationMinutes: 40,
    weeklyLessonCount: 1,
    active: true,
    primary: false,
    createdAt: NOW,
    termsVersion: 2,
    studentTypes: [],
    packageName: "Bireysel Aylık — 4 ders",
    monthlyFee: 3000,
    ...over,
  } as StudentEnrollment;
}

function student(enrollments: StudentEnrollment[]): Student {
  return {
    id: "s1",
    name: "Deniz Ak",
    branchId: "b1",
    instruments: enrollments.filter((e) => e.active).map((e) => e.instrument),
    teacherId: enrollments[0]!.teacherId ?? "",
    lessonDurationMinutes: 40,
    weeklyLessonCount: 1,
    packageName: "x",
    monthlyFee: 1,
    active: true,
    createdAt: NOW,
    studentTypes: [],
    enrollments,
  } as unknown as Student;
}

describe("branş kartı doğrulaması (kayıt, branş ekleme ve düzenleme AYNI fonksiyon)", () => {
  const base = {
    teacherId: "t1",
    startDate: "2026-10-01",
    lessonScheduleText: "Salı 15:00",
    intendedDurationMonths: "3",
    monthlyFee: "3000",
  };

  it("MEB olan branşta eksik sınav tarihi hatası O branşın alanına yazılır; MEB olmayan branş etkilenmez", () => {
    const meb = emptyEnrollmentDraft({ ...base, instrument: "Piyano", studentTypes: ["MEB"], mebExamStatus: "attended" });
    const plain = emptyEnrollmentDraft({ ...base, teacherId: "t2", instrument: "Gitar", studentTypes: [], mebExamStatus: "attended" });
    const errs = validateEnrollmentDrafts([meb, plain], { mode: "register" });
    expect(errs[meb.key]?.mebExamDate).toBeTruthy();
    expect(errs[plain.key]?.mebExamDate).toBeUndefined();
  });

  it("ek (ikinci) branş da MEB ise MEB kuralları aynen uygulanır", () => {
    const first = emptyEnrollmentDraft({ ...base, instrument: "Piyano" });
    const second = emptyEnrollmentDraft({ ...base, teacherId: "t2", instrument: "Gitar", studentTypes: ["MEB"], mebExamStatus: "attended" });
    const errs = validateEnrollmentDrafts([first, second], { mode: "register" });
    expect(errs[second.key]?.mebExamDate).toBeTruthy();
    expect(errs[first.key]?.mebExamDate).toBeUndefined();
  });

  it("aynı enstrüman + aynı öğretmenle ikinci branş reddedilir", () => {
    const a = emptyEnrollmentDraft({ ...base, instrument: "Piyano" });
    const b = emptyEnrollmentDraft({ ...base, instrument: "Piyano" });
    const errs = validateEnrollmentDrafts([a, b], { mode: "register" });
    expect(errs[b.key]?.teacherId).toContain("Aynı öğretmenle");
  });

  it("kayıt anı ilk tahsilat eksikse her branş kendi alanında hata alır", () => {
    const d = emptyEnrollmentDraft({ ...base, instrument: "Piyano" });
    const errs = validateEnrollmentDraft(d, { mode: "register" });
    expect(errs["firstPayment.amount"]).toBeTruthy();
    // Düzenleme kipinde ilk tahsilat istenmez.
    expect(validateEnrollmentDraft(d, { mode: "edit" })["firstPayment.amount"]).toBeUndefined();
  });
});

describe("branş izolasyonu", () => {
  it("bir branşın koşulunu değiştirmek diğer branşı DEĞİŞTİRMEZ", () => {
    const a = record({ id: "a", instrument: "Piyano", primary: true, monthlyFee: 3000, studentTypes: ["MEB"], level: "3" });
    const b = record({ id: "b", instrument: "Gitar", monthlyFee: 2000, studentTypes: [] });
    const res = applyEnrollmentChange(student([a, b]), { kind: "patchTerms", enrollmentId: "b", terms: { monthlyFee: 2500 } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const nextA = res.enrollments.find((e) => e.id === "a")!;
    const nextB = res.enrollments.find((e) => e.id === "b")!;
    expect(nextA.monthlyFee).toBe(3000);
    expect(nextA.level).toBe("3");
    expect(nextA.studentTypes).toEqual(["MEB"]);
    expect(nextB.monthlyFee).toBe(2500);
  });

  it("ikinci branşın türü MEB iken birinci branş MEB OLMAZ (öğrenci satırı birleşimi branşa sızmaz)", () => {
    const a = record({ id: "a", instrument: "Piyano", primary: true, studentTypes: [] });
    const b = record({ id: "b", instrument: "Gitar", studentTypes: ["MEB"], level: "2" });
    const s = student([a, b]);
    // Ayna: kişi düzeyi özet = aktif branşların birleşimi.
    const res = applyEnrollmentChange(s, { kind: "patchTerms", enrollmentId: "b", terms: { level: "2" } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mirror.studentTypes).toEqual(["MEB"]);
    // Ama branşların KENDİ koşulları ayrı kalır.
    const merged = { ...s, enrollments: res.enrollments };
    expect(enrollmentTerms(merged, res.enrollments.find((e) => e.id === "a")!).studentTypes).toEqual([]);
    expect(enrollmentTerms(merged, res.enrollments.find((e) => e.id === "b")!).studentTypes).toEqual(["MEB"]);
  });

  it("son aktif branş kapatılamaz", () => {
    const a = record({ id: "a", instrument: "Piyano", primary: true });
    const b = record({ id: "b", instrument: "Gitar", active: false });
    const res = applyEnrollmentChange(student([a, b]), { kind: "patchTerms", enrollmentId: "a", terms: { active: false } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NO_ACTIVE");
  });

  it("çok branşlı öğrencide hedef verilmeden branş koşulu yazımı REDDEDİLİR (ilk branşa sessiz yazım yok)", () => {
    const s = student([record({ id: "a", instrument: "Piyano", primary: true }), record({ id: "b", instrument: "Gitar" })]);
    const route = routeTermPatch(s, undefined);
    expect(route.mode).toBe("error");
    expect(routeTermPatch(s, "b")).toMatchObject({ mode: "record", enrollmentId: "b" });
  });

  it("eski sürüm (iki sefer kaydedilmiş) güncelleme: beklenen zaman damgası uyuşmazsa STALE", () => {
    const a = record({ id: "a", instrument: "Piyano", primary: true, updatedAt: "2026-10-02T00:00:00.000Z" });
    const b = record({ id: "b", instrument: "Gitar" });
    const res = applyEnrollmentChange(student([a, b]), {
      kind: "patchTerms",
      enrollmentId: "a",
      terms: { monthlyFee: 1 },
      expectedUpdatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("STALE");
  });
});

describe("MEB listesi branş başına satır", () => {
  it("yalnız MEB olan branş satır üretir ve değerleri o branşın kendi kaydından okunur", () => {
    const a = record({ id: "a", instrument: "Piyano", primary: true, studentTypes: [], level: "1" });
    const b = record({ id: "b", instrument: "Gitar", studentTypes: ["MEB"], level: "4", mebLevelStartDate: "2026-09-01", mebLevelEndDate: "2026-12-01" });
    const rows = mebRowsForStudent(student([a, b]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "s1", enrollmentId: "b", instrument: "Gitar", level: "4", mebLevelStartDate: "2026-09-01" });
  });

  it("iki MEB branşı iki ayrı satırdır; sonlandırılan branş pasif satırdır", () => {
    const a = record({ id: "a", instrument: "Piyano", primary: true, studentTypes: ["MEB"], level: "2" });
    const b = record({ id: "b", instrument: "Gitar", studentTypes: ["MEB"], level: "5", active: false });
    const rows = mebRowsForStudent(student([a, b]));
    expect(rows.map((r) => [r.enrollmentId, r.level, r.active])).toEqual([
      ["a", "2", true],
      ["b", "5", false],
    ]);
  });
});
