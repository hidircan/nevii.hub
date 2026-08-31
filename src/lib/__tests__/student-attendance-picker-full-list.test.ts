import { describe, it, expect } from "vitest";
import { filterAttendanceStudents, type AttendanceStudentOption } from "../../components/student-attendance-picker";

/**
 * Yoklama öğrenci arama dropdown'u — önceden `RESULT_LIMIT = 10` ile ilk 10
 * sonuca sabitliydi, kaydırma yapılsa bile geri kalan öğrenciler hiç
 * görünmüyordu. Artık `filterAttendanceStudents` (saf fonksiyon) tam listeyi
 * döner; kaydırma davranışı UI'daki `max-h-80 overflow-y-auto` listbox'a
 * bırakılır.
 */
function students(count: number): AttendanceStudentOption[] {
  return Array.from({ length: count }, (_, i) => ({ id: `s${i}`, name: `Öğrenci ${i}` }));
}

describe("filterAttendanceStudents", () => {
  it("boş arama metninde TÜM öğrencileri döner (önceki 10 sınırı yok)", () => {
    const all = students(25);
    expect(filterAttendanceStudents(all, "")).toHaveLength(25);
  });

  it("eşleşen arama yalnız eşleşenleri döner, Türkçe karakter duyarsız", () => {
    const list: AttendanceStudentOption[] = [
      { id: "1", name: "Çağla Yıldız" },
      { id: "2", name: "Şule Demir" },
      { id: "3", name: "Ahmet Kaya" },
    ];
    expect(filterAttendanceStudents(list, "cagla")).toEqual([list[0]]);
    expect(filterAttendanceStudents(list, "ŞULE")).toEqual([list[1]]);
  });

  it("eşleşme yoksa boş liste döner", () => {
    const list = students(5);
    expect(filterAttendanceStudents(list, "hiçkimse")).toEqual([]);
  });
});
