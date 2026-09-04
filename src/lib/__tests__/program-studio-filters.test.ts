import { describe, it, expect } from "vitest";
import {
  filterLessonsForCalendar,
  activeTeachersForBranch,
  resolveTeacherFilterForBranch,
  resolveRoomFilterForBranch,
  studentsForBranch,
  resolveStudentFilterForBranch,
  lessonCardTier,
  computeGridWindow,
  lessonAccessibleLabel,
} from "../../components/program-studio";
import type { Lesson, Room, Student, Teacher } from "../types";

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: "l1",
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: "2026-08-03T10:00:00+03:00",
    endAt: "2026-08-03T10:45:00+03:00",
    type: "regular",
    status: "scheduled",
    ...overrides,
  };
}

function teacher(overrides: Partial<Teacher>): Teacher {
  return {
    id: "t1",
    name: "Nilüfer Acar",
    email: "n@x.com",
    phone: "0",
    branchId: "erzene",
    instruments: ["Piyano"],
    availability: [],
    maxDailyLessons: 8,
    active: true,
    color: "#000",
    ...overrides,
  };
}

function student(overrides: Partial<Student>): Student {
  return {
    id: "s1",
    name: "Zeynep Arslan",
    email: "z@x.com",
    phone: "0",
    parentName: "P",
    parentPhone: "0",
    branchId: "erzene",
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    active: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00+03:00",
    ...overrides,
  };
}

describe("filterLessonsForCalendar", () => {
  const lessons = [
    lesson({ id: "l1", branchId: "erzene", teacherId: "t1", studentId: "s1" }),
    lesson({ id: "l2", branchId: "evka3", teacherId: "t2", studentId: "s2" }),
    lesson({ id: "l3", branchId: "erzene", teacherId: "t2", studentId: "s1" }),
  ];

  it("filtre yokken tüm dersleri döner", () => {
    expect(filterLessonsForCalendar(lessons, "", "")).toHaveLength(3);
  });

  it("şube filtresi yalnızca o şubenin derslerini bırakır", () => {
    const result = filterLessonsForCalendar(lessons, "erzene", "");
    expect(result.map((l) => l.id)).toEqual(["l1", "l3"]);
  });

  it("öğretmen filtresi diğer öğretmenlerin derslerini tamamen gizler", () => {
    const result = filterLessonsForCalendar(lessons, "", "t2");
    expect(result.map((l) => l.id)).toEqual(["l2", "l3"]);
  });

  it("şube ve öğretmen filtresi birlikte çalışır", () => {
    const result = filterLessonsForCalendar(lessons, "erzene", "t2");
    expect(result.map((l) => l.id)).toEqual(["l3"]);
  });

  it("öğrenci filtresi boşken eski iki filtreli davranış aynen korunur", () => {
    expect(filterLessonsForCalendar(lessons, "erzene", "t2", "")).toEqual(
      filterLessonsForCalendar(lessons, "erzene", "t2")
    );
  });

  it("öğrenci filtresi yalnız seçili öğrencinin derslerini döndürür", () => {
    const result = filterLessonsForCalendar(lessons, "", "", "s1");
    expect(result.map((l) => l.id)).toEqual(["l1", "l3"]);
  });

  it("şube ve öğrenci filtresi AND mantığıyla çalışır", () => {
    const result = filterLessonsForCalendar(lessons, "evka3", "", "s1");
    expect(result).toHaveLength(0);
  });

  it("öğretmen ve öğrenci filtresi AND mantığıyla çalışır", () => {
    const result = filterLessonsForCalendar(lessons, "", "t2", "s1");
    expect(result.map((l) => l.id)).toEqual(["l3"]);
  });
});

describe("activeTeachersForBranch", () => {
  const teachers = [
    teacher({ id: "t1", branchId: "erzene", active: true }),
    teacher({ id: "t2", branchId: "evka3", active: true }),
    teacher({ id: "t3", branchId: "erzene", active: false }),
  ];

  it("filtre yokken tüm aktif öğretmenleri döner, pasifleri hariç tutar", () => {
    const result = activeTeachersForBranch(teachers, "");
    expect(result.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("şube filtresi yalnızca o şubenin aktif öğretmenlerini bırakır", () => {
    const result = activeTeachersForBranch(teachers, "erzene");
    expect(result.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("resolveTeacherFilterForBranch", () => {
  const teachers = [teacher({ id: "t1", branchId: "erzene" }), teacher({ id: "t2", branchId: "evka3" })];

  it("öğretmen filtresi seçili değilse boş kalır", () => {
    expect(resolveTeacherFilterForBranch(teachers, "evka3", "")).toBe("");
  });

  it("seçili öğretmen yeni şubede geçerliyse korunur", () => {
    expect(resolveTeacherFilterForBranch(teachers, "erzene", "t1")).toBe("t1");
  });

  it("seçili öğretmen yeni şubede geçersizse Tüm öğretmenlere döner", () => {
    expect(resolveTeacherFilterForBranch(teachers, "evka3", "t1")).toBe("");
  });

  it("Tüm şubeler seçilirse önceki öğretmen filtresi korunur", () => {
    expect(resolveTeacherFilterForBranch(teachers, "", "t1")).toBe("t1");
  });
});

describe("studentsForBranch", () => {
  const students = [
    student({ id: "s1", name: "Zeynep Arslan", branchId: "erzene" }),
    student({ id: "s2", name: "Ali Koç", branchId: "evka3" }),
    student({ id: "s3", name: "Burak Aydın", branchId: "erzene" }),
  ];

  it("filtre yokken tüm öğrencileri Türkçe ada göre sıralı döner", () => {
    const result = studentsForBranch(students, "");
    expect(result.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("şube filtresi yalnızca o şubenin öğrencilerini bırakır", () => {
    const result = studentsForBranch(students, "erzene");
    expect(result.map((s) => s.id)).toEqual(["s3", "s1"]);
  });
});

describe("resolveStudentFilterForBranch", () => {
  const students = [student({ id: "s1", branchId: "erzene" }), student({ id: "s2", branchId: "evka3" })];

  it("öğrenci filtresi seçili değilse boş kalır", () => {
    expect(resolveStudentFilterForBranch(students, "evka3", "")).toBe("");
  });

  it("seçili öğrenci yeni şubede geçerliyse korunur", () => {
    expect(resolveStudentFilterForBranch(students, "erzene", "s1")).toBe("s1");
  });

  it("şube değiştiğinde o şubeye ait olmayan seçili öğrencinin filtresi temizlenir", () => {
    expect(resolveStudentFilterForBranch(students, "evka3", "s1")).toBe("");
  });

  it("Tüm şubeler seçilirse önceki öğrenci filtresi korunur", () => {
    expect(resolveStudentFilterForBranch(students, "", "s1")).toBe("s1");
  });
});

function room(overrides: Partial<Room>): Room {
  return {
    id: "r1",
    name: "Stüdyo 1",
    branchId: "erzene",
    capacity: 1,
    instruments: ["Piyano"],
    ...overrides,
  };
}

describe("resolveRoomFilterForBranch", () => {
  const rooms = [room({ id: "r1", branchId: "erzene" }), room({ id: "r2", branchId: "evka3" })];

  it("oda filtresi seçili değilse boş kalır", () => {
    expect(resolveRoomFilterForBranch(rooms, "evka3", "")).toBe("");
  });

  it("seçili oda yeni şubede geçerliyse korunur", () => {
    expect(resolveRoomFilterForBranch(rooms, "erzene", "r1")).toBe("r1");
  });

  it("seçili oda yeni şubede geçersizse sıfırlanır", () => {
    expect(resolveRoomFilterForBranch(rooms, "evka3", "r1")).toBe("");
  });

  it("Tüm şubeler seçilirse önceki oda filtresi korunur", () => {
    expect(resolveRoomFilterForBranch(rooms, "", "r1")).toBe("r1");
  });
});

describe("computeGridWindow", () => {
  const workingHours = { start: "09:00", end: "18:00" };

  it("ders yokken bile 10:00 tabanının altına inmez (09:00-10:00 hiç görünmez)", () => {
    expect(computeGridWindow(workingHours, [])).toEqual({ startMin: 10 * 60, endMin: 18 * 60 });
  });

  it("mesai saatleri içindeki ders grid'i genişletmez", () => {
    const lessons = [{ startAt: "2026-08-03T10:00:00+03:00", endAt: "2026-08-03T10:40:00+03:00" }];
    expect(computeGridWindow(workingHours, lessons)).toEqual({ startMin: 10 * 60, endMin: 18 * 60 });
  });

  it("mesai dışı erken saatteki (09:00 öncesi) bir ders bile 10:00 tabanını geçemez", () => {
    const lessons = [{ startAt: "2026-08-02T07:10:00+03:00", endAt: "2026-08-02T07:50:00+03:00" }];
    expect(computeGridWindow(workingHours, lessons)).toEqual({ startMin: 10 * 60, endMin: 18 * 60 });
  });

  it("mesai sonrası geç saatteki ders grid bitişini ileriye genişletir (bitiş davranışı değişmedi)", () => {
    const lessons = [{ startAt: "2026-08-03T20:00:00+03:00", endAt: "2026-08-03T20:50:00+03:00" }];
    expect(computeGridWindow(workingHours, lessons)).toEqual({ startMin: 10 * 60, endMin: 20 * 60 + 60 });
  });

  it("10:00 tabanının ÜZERİNDEKİ bir ders 30 dakikalık slot sınırına yuvarlanarak grid'i genişletir", () => {
    const lateStartWorkingHours = { start: "12:00", end: "18:00" };
    const lessons = [{ startAt: "2026-08-03T11:07:00+03:00", endAt: "2026-08-03T11:37:00+03:00" }];
    const result = computeGridWindow(lateStartWorkingHours, lessons);
    expect(result.startMin % 30).toBe(0);
    expect(result.startMin).toBe(11 * 60);
  });
});

describe("lessonCardTier", () => {
  it("40px'ten kısa kartlarda yalnızca öğrenci+saat gösterilecek 'min' katmanı döner", () => {
    expect(lessonCardTier(26)).toBe("min");
    expect(lessonCardTier(39)).toBe("min");
  });

  it("orta yükseklikte öğretmen satırı eklenen 'compact' katmanı döner", () => {
    expect(lessonCardTier(40)).toBe("compact");
    expect(lessonCardTier(63)).toBe("compact");
  });

  it("yeterli yükseklikte enstrüman/şube satırının da eklendiği 'full' katmanı döner", () => {
    expect(lessonCardTier(64)).toBe("full");
    expect(lessonCardTier(100)).toBe("full");
  });
});

describe("lessonAccessibleLabel — ders kartının erişilebilir açıklaması", () => {
  it("öğrenci, saat, öğretmen, enstrüman, oda ve şubeyi tek cümlede birleştirir", () => {
    const l = lesson({ startAt: "2026-08-04T11:00:00+03:00", endAt: "2026-08-04T11:40:00+03:00" });
    const label = lessonAccessibleLabel(l, student({}), teacher({}), room({}), "Erzene Şubesi");
    expect(label).toBe("Zeynep Arslan · 11:00–11:40 · Nilüfer Acar · Piyano · Stüdyo 1 · Erzene Şubesi");
  });

  it("telafi dersinde 'Telafi dersi' etiketini ekler", () => {
    const l = lesson({ type: "makeup" });
    const label = lessonAccessibleLabel(l, student({}), teacher({}));
    expect(label).toContain("Telafi dersi");
  });

  it("normal (telafi olmayan) derste 'Telafi dersi' etiketini eklemez", () => {
    const l = lesson({ type: "regular" });
    const label = lessonAccessibleLabel(l, student({}), teacher({}));
    expect(label).not.toContain("Telafi");
  });

  it("eksik alanlar (öğrenci/öğretmen/oda/şube bulunamadı) sessizce atlanır, boş segment üretmez", () => {
    const l = lesson({});
    const label = lessonAccessibleLabel(l);
    expect(label).not.toMatch(/·\s*·/); // ardışık ayraç yok — hiçbir boş segment yok
    expect(label).toContain("Öğrenci bilinmiyor");
  });
});
