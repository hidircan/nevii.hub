/**
 * MEB Paneli — liste sorgusu testleri (`applyMebStudentQuery`, json/memory
 * yolunun saf çekirdeği; db yolu AYNI semantiği Prisma ile uygular).
 *
 * Kapsam: MEB-ise-listele (çoklu tür + legacy), pasif görünürlüğü, silinmiş
 * dışlama, arama, sınav filtresi, kararlı sıralama, sayfalama + toplam.
 */
import { describe, it, expect } from "vitest";
import { applyMebStudentQuery } from "../meb-list";
import type { Student, StudentType } from "../types";

let seq = 0;
function student(overrides: Partial<Student> = {}): Student {
  seq += 1;
  const id = overrides.id ?? `stu-test-${seq}`;
  return {
    id,
    name: `Öğrenci ${seq}`,
    email: "",
    phone: "5550000000",
    parentName: "Veli",
    parentPhone: "5550000000",
    branchId: "erzene",
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    active: true,
    notes: "",
    createdAt: "2026-09-01T12:00:00.000Z",
    studentTypes: [],
    ...overrides,
  } as Student;
}

const MEB: StudentType = "MEB";
const HOBI: StudentType = "Hobi";

describe("applyMebStudentQuery — MEB-ise-listele", () => {
  it("çoklu türde MEB varsa listelenir, yoksa listelenmez", () => {
    const rows = [
      student({ id: "a", name: "A", studentTypes: [HOBI, MEB] }),
      student({ id: "b", name: "B", studentTypes: [HOBI] }),
    ];
    const res = applyMebStudentQuery(rows, {});
    expect(res.rows.map((r) => r.id)).toEqual(["a"]);
    expect(res.total).toBe(1);
  });

  it("legacy tekil MEB kaydı listelenir (geriye dönük uyum)", () => {
    const rows = [student({ id: "legacy", name: "L", studentTypes: [], studentType: MEB })];
    expect(applyMebStudentQuery(rows, {}).total).toBe(1);
  });

  it("silinmiş MEB kaydı listelenmez", () => {
    const rows = [student({ id: "del", name: "D", studentTypes: [MEB], deletedAt: "2026-09-02T00:00:00.000Z" })];
    expect(applyMebStudentQuery(rows, {}).total).toBe(0);
  });

  it("aktif/pasif filtresi: varsayılan filtresizdir; pasif veri kaybolmaz", () => {
    const rows = [
      student({ id: "a", name: "A", studentTypes: [MEB], active: true }),
      student({ id: "p", name: "P", studentTypes: [MEB], active: false }),
    ];
    expect(applyMebStudentQuery(rows, { active: true }).total).toBe(1);
    expect(applyMebStudentQuery(rows, { active: false }).rows[0]?.id).toBe("p");
    expect(applyMebStudentQuery(rows, {}).total).toBe(2);
  });
});

describe("applyMebStudentQuery — arama / filtre / sıralama / sayfalama", () => {
  const rows = [
    student({ id: "s1", name: "Deniz Ak", displayId: "S00003", studentTypes: [MEB], level: "2" }),
    student({ id: "s2", name: "Efe Yılmaz", displayId: "S00001", studentTypes: [MEB], level: "5" }),
    student({ id: "s3", name: "Deniz Kaya", displayId: "S00002", studentTypes: [MEB], level: "5" }),
  ];

  it("ad veya numarayla arama (Türkçe duyarsız)", () => {
    expect(applyMebStudentQuery(rows, { search: "deniz" }).total).toBe(2);
    expect(applyMebStudentQuery(rows, { search: "S00001" }).rows[0]?.id).toBe("s2");
  });

  it("sınav durumu filtresi tri-state'i ayırır", () => {
    const withExam = [
      student({ id: "u", name: "U", studentTypes: [MEB] }),
      student({ id: "n", name: "N", studentTypes: [MEB], mebExamAttended: false }),
      student({ id: "a", name: "A", studentTypes: [MEB], mebExamDate: "2020-01-01", mebExamAttended: true }),
    ];
    expect(applyMebStudentQuery(withExam, { examStatus: "unknown" }).rows.map((r) => r.id)).toEqual(["u"]);
    expect(applyMebStudentQuery(withExam, { examStatus: "not_attended" }).rows.map((r) => r.id)).toEqual(["n"]);
    expect(applyMebStudentQuery(withExam, { examStatus: "attended" }).rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("kararlı sıralama: eşitlikte id tiebreak (sayfa kayması yok)", () => {
    const res = applyMebStudentQuery(rows, { sort: "level", sortDir: "desc", pageSize: 10 });
    // Seviye 5 olan iki satır id sırasıyla gelir.
    expect(res.rows.map((r) => r.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("bilinmeyen tarihler her yönde sona atılır", () => {
    const dated = [
      student({ id: "d1", name: "D1", studentTypes: [MEB], mebLevelStartDate: "2026-09-01T12:00:00.000Z" }),
      student({ id: "d2", name: "D2", studentTypes: [MEB] }),
    ];
    expect(applyMebStudentQuery(dated, { sort: "mebLevelStartDate", sortDir: "asc" }).rows.map((r) => r.id)).toEqual([
      "d1",
      "d2",
    ]);
    expect(applyMebStudentQuery(dated, { sort: "mebLevelStartDate", sortDir: "desc" }).rows.map((r) => r.id)).toEqual([
      "d1",
      "d2",
    ]);
  });

  it("sayfalama: toplam korunur, sayfa dilimleri çakışmaz", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      student({ id: `m${i}`, name: `M ${i}`, studentTypes: [MEB] })
    );
    const p1 = applyMebStudentQuery(many, { page: 1, pageSize: 2 });
    const p2 = applyMebStudentQuery(many, { page: 2, pageSize: 2 });
    const p3 = applyMebStudentQuery(many, { page: 3, pageSize: 2 });
    expect(p1.total).toBe(5);
    expect(p1.rows).toHaveLength(2);
    expect(p2.rows).toHaveLength(2);
    expect(p3.rows).toHaveLength(1);
    const ids = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("sayfa boyutu üst sınırı (100) aşılamaz", () => {
    const res = applyMebStudentQuery(rows, { pageSize: 9999 });
    expect(res.pageSize).toBe(100);
  });
});
