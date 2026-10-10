/** UAT 2026-09-25 (Öncelik 3) — Yoklama Takvimi seçicisi yalnız aktif öğrencileri önerir. */
import { describe, it, expect } from "vitest";
import { attendancePickerStudents, resolveAttendanceCalendarStudentId } from "../attendance-calendar";

const students = [
  { id: "a", name: "Zeynep", active: true },
  { id: "b", name: "Ali", active: false },
  { id: "c", name: "Cem" },
  { id: "d", name: "Deniz", active: true, deletedAt: "2026-09-01" },
];

describe("attendancePickerStudents", () => {
  it("pasif ve silinmiş öğrenci önerilmez; sıralama Türkçe", () => {
    expect(attendancePickerStudents(students, null).map((o) => o.student.id)).toEqual(["c", "a"]);
  });

  it("URL ile açılmış pasif öğrenci tarihsel görüntüleme için listede kalır, pasif işaretlenir", () => {
    const opts = attendancePickerStudents(students, "b");
    expect(opts.find((o) => o.student.id === "b")?.inactive).toBe(true);
    expect(opts).toHaveLength(3);
  });

  it("pasif öğrencinin takvimi kapsam içinde çözülmeye devam eder (kayıtlar silinmez)", () => {
    expect(resolveAttendanceCalendarStudentId("b", students.map((s) => s.id))).toBe("b");
  });
});
