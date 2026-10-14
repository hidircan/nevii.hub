/**
 * 2026-10-14 — Öğretmenler ekranı: bir öğretmenin öğrencileri YALNIZ aktif öğrenciler. Kanonik aktiflik
 * `isActiveStudent` (aktif + silinmemiş); ilişki aktif eğitim kaydından. Liste sayacı, özet ve Öğrenciler sekmesi
 * aynı fonksiyonu kullanır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { activeTeacherIdsOf, isActiveOwnStudent, isOwnStudent } from "../teacher-portal-scope";
import type { Student, StudentEnrollment } from "../types";

const enr = (id: string, teacherId: string, active = true): StudentEnrollment =>
  ({ id, instrument: "Piyano", teacherId, active, primary: false, createdAt: "2026-09-01" }) as StudentEnrollment;
const st = (over: Partial<Student>): Pick<Student, "id" | "teacherId" | "enrollments" | "active" | "deletedAt"> => ({
  id: "s",
  teacherId: "tA",
  active: true,
  ...over,
});

describe("isActiveOwnStudent", () => {
  it("aktif öğrenci listelenir; pasif (arşivli) ve silinmiş listelenmez", () => {
    expect(isActiveOwnStudent(st({}), "tA")).toBe(true);
    expect(isActiveOwnStudent(st({ active: false }), "tA")).toBe(false);
    expect(isActiveOwnStudent(st({ deletedAt: "2026-10-01T00:00:00.000Z" }), "tA")).toBe(false);
  });

  it("çok branş: yalnız AKTİF kaydın öğretmeni; kapanmış branşın öğretmeni öğrenciyi görmez", () => {
    const s = st({ teacherId: "tA", enrollments: [enr("e1", "tA"), enr("e2", "tB", false)] });
    expect(isActiveOwnStudent(s, "tA")).toBe(true);
    expect(isActiveOwnStudent(s, "tB")).toBe(false);
  });

  it("tüm kayıtları kapanmış öğrencide eski `teacherId` aynası ilişki saymaz (portal erişimi ayrı kalır)", () => {
    const s = st({ teacherId: "tA", enrollments: [enr("e1", "tA", false)] });
    expect(isActiveOwnStudent(s, "tA")).toBe(false);
    expect(isOwnStudent(s as Student, "tA")).toBe(true); // isOwnStudent bilinçli olarak değişmedi
  });

  it("mükerrer ilişki (aynı öğretmen iki aktif branşta) tek sayılır", () => {
    expect(activeTeacherIdsOf(st({ enrollments: [enr("e1", "tA"), enr("e2", "tA"), enr("e3", "tB")] }))).toEqual(["tA", "tB"]);
  });

  it("kalıcı kaydı olmayan eski öğrenci `teacherId` ile eşleşir", () => {
    expect(activeTeacherIdsOf(st({ enrollments: undefined }))).toEqual(["tA"]);
  });
});

describe("Öğretmenler ekranı üç sayaç aynı kuralı kullanır (sunucu tarafı filtre)", () => {
  const root = path.resolve(__dirname, "../../app/panel/ogretmenler");
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");

  it("Öğrenciler sekmesi: liste, sayaç ve sayfalama aynı aktif listeden", () => {
    const src = read("[teacherId]/ogrenciler/page.tsx");
    expect(src).toMatch(/filter\(\(s\) => isActiveOwnStudent\(s, teacher\.id\)\)/);
    expect(src).not.toMatch(/isOwnStudent\(/);
    expect(src).not.toMatch(/"Pasif"/);
  });

  it("Özet sekmesi etiketi ve liste sayacı aynı kuraldan", () => {
    expect(read("[teacherId]/page.tsx")).toMatch(/isActiveOwnStudent\(s, teacher\.id\)/);
    const list = read("page.tsx");
    expect(list).toMatch(/isActiveStudent\(s\)/);
    expect(list).toMatch(/activeTeacherIdsOf\(s\)/);
  });
});
