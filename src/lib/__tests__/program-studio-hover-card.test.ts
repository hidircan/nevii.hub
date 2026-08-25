import { describe, it, expect } from "vitest";
import { lessonHoverCardLines } from "../../components/program-studio";
import type { Lesson, Room, Student, Teacher } from "../types";

/**
 * Program ekranı — ders bloğunun üzerine gelindiğinde (tıklamadan) görünen
 * hover kartının içerik satırları. Saf fonksiyon (`lessonHoverCardLines`),
 * DOM render'ı olmayan `node` test ortamında (bkz. vitest.config.mts)
 * doğrudan test edilebiliyor.
 */
function lesson(overrides?: Partial<Lesson>): Lesson {
  return {
    id: "l1",
    studentId: "s1",
    teacherId: "t1",
    branchId: "erzene" as Lesson["branchId"],
    roomId: "r1",
    instrument: "Piyano",
    startAt: "2026-08-25T10:00:00.000Z",
    endAt: "2026-08-25T10:40:00.000Z",
    status: "scheduled",
    type: "regular",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Lesson;
}

function student(overrides?: Partial<Student>): Student {
  return {
    id: "s1",
    name: "Deniz Ak",
    email: "",
    phone: "",
    parentName: "",
    parentPhone: "",
    branchId: "erzene" as Student["branchId"],
    instruments: [],
    teacherId: "t1",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    active: true,
    notes: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function teacher(overrides?: Partial<Teacher>): Teacher {
  return {
    id: "t1",
    name: "Turgay Hoşbaş",
    email: "",
    phone: "",
    branchId: "erzene" as Teacher["branchId"],
    instruments: [],
    availability: [],
    maxDailyLessons: 8,
    active: true,
    color: "#000",
    ...overrides,
  };
}

const room: Room = { id: "r1", name: "Oda 1", branchId: "erzene" as Room["branchId"], capacity: 1 } as Room;

describe("lessonHoverCardLines — ders kartı hover içeriği", () => {
  it("öğrenci adı, tarih, saat, öğretmen, enstrüman, salon ve şube satırlarını içerir", () => {
    const lines = lessonHoverCardLines(lesson(), student(), teacher(), room, "Erzene");
    expect(lines[0]).toBe("Deniz Ak");
    expect(lines).toContain("Öğretmen: Turgay Hoşbaş");
    expect(lines).toContain("Enstrüman: Piyano");
    expect(lines).toContain("Salon: Oda 1");
    expect(lines).toContain("Şube: Erzene");
  });

  it("öğrenci bilinmiyorsa yer tutucu metin gösterir", () => {
    const lines = lessonHoverCardLines(lesson(), undefined, teacher());
    expect(lines[0]).toBe("Öğrenci bilinmiyor");
  });

  it("telafi dersinde 'Telafi dersi' satırı eklenir", () => {
    const lines = lessonHoverCardLines(lesson({ type: "makeup" }), student(), teacher());
    expect(lines).toContain("Telafi dersi");
  });

  it("öğretmenin müsait olmadığı saatte uyarı satırı eklenir", () => {
    const lines = lessonHoverCardLines(lesson({ availabilityOverride: { by: "admin1", at: new Date().toISOString() } }), student(), teacher());
    expect(lines).toContain("Öğretmenin müsait olmadığı bir saat");
  });

  it("normal, müsaitlik ihlali olmayan bir ders için uyarı satırları eklenmez", () => {
    const lines = lessonHoverCardLines(lesson(), student(), teacher());
    expect(lines).not.toContain("Telafi dersi");
    expect(lines).not.toContain("Öğretmenin müsait olmadığı bir saat");
  });
});
