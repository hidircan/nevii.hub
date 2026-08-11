import { describe, it, expect } from "vitest";
import { validateLessonSlot } from "../makeup-engine";
import type { AppData } from "../types";

/**
 * Okulun mesai saati Pzt–Cuma 09:00–18:00; Pazar ve mesai dışı saatlerde
 * planlamayı engelleyen eski kural kaldırıldı. Bu testler doğrudan
 * validateLessonSlot'u çağırarak okulun genel çalışma günü/saatinin artık
 * bir engel olmadığını, öğretmenin kendi bildirdiği müsaitliğin ise hâlâ
 * geçerli bir kısıt olarak kaldığını doğrular.
 */
function buildData(overrides?: { teacherAvailability?: AppData["teachers"][number]["availability"] }): AppData {
  return {
    settings: {
      tenantId: "tenant_test",
      name: "Test Akademi",
      shortName: "Test",
      city: "İzmir",
      website: "",
      email: "",
      phone: "",
      logoUrl: "",
      makeupWindowDays: 14,
      lessonDurationMinutes: 40,
      workingHours: { start: "09:00", end: "18:00" },
      workingDays: [1, 2, 3, 4, 5],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [{ id: "erzene", name: "Erzene", shortName: "Erzene", address: "", phone: "", city: "İzmir" }],
    },
    teachers: [
      {
        id: "t1",
        name: "Nilüfer",
        email: "t1@test.com",
        phone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        availability: overrides?.teacherAvailability ?? [
          { dayOfWeek: 0, start: "10:00", end: "22:00" },
          { dayOfWeek: 1, start: "09:00", end: "18:00" },
        ],
        maxDailyLessons: 8,
        active: true,
        color: "#000",
      },
    ],
    students: [
      {
        id: "s1",
        name: "Zeynep",
        email: "",
        phone: "",
        parentName: "",
        parentPhone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        teacherId: "t1",
        packageName: "",
        weeklyLessonCount: 1,
        monthlyFee: 0,
        active: true,
        notes: "",
        createdAt: "2026-01-01T00:00:00+03:00",
      },
    ],
    rooms: [{ id: "r1", name: "Stüdyo 1", branchId: "erzene", capacity: 1, instruments: ["Piyano"] }],
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
  };
}

/** Önümüzdeki bir Pazar (dayOfWeek 0) tarihini ISO olarak döner. */
function nextSunday(hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Önümüzdeki bir Pazartesi (dayOfWeek 1), mesai saati dışında (20:00) bir ISO döner. */
function nextMondayEvening(hour: number, minute = 0): string {
  const d = new Date();
  const diff = ((1 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

describe("validateLessonSlot — okul mesai kısıtı kaldırıldı", () => {
  it("Pazar günü, öğretmen müsaitse ders planlanabilir", () => {
    const data = buildData();
    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11) }
    );
    expect(result.ok).toBe(true);
  });

  it("mesai saatleri dışında (20:00), öğretmen müsaitse ders planlanabilir", () => {
    const data = buildData({
      teacherAvailability: [{ dayOfWeek: 1, start: "09:00", end: "22:00" }],
    });
    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextMondayEvening(20) }
    );
    expect(result.ok).toBe(true);
  });

  it("öğretmenin kendi bildirdiği müsaitlik dışı bir saatte hâlâ TEACHER_UNAVAILABLE döner", () => {
    const data = buildData({
      teacherAvailability: [{ dayOfWeek: 1, start: "09:00", end: "18:00" }],
    });
    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_UNAVAILABLE");
  });

  it("çakışma/oda/enstrüman kontrolleri Pazar günü de aynen çalışır", () => {
    const data = buildData();
    const existingLesson = {
      id: "l1",
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene" as const,
      instrument: "Piyano" as const,
      startAt: nextSunday(11),
      endAt: nextSunday(11, 40),
      type: "regular" as const,
      status: "scheduled" as const,
    };
    const withLesson = { ...data, lessons: [existingLesson] };
    const result = validateLessonSlot(
      withLesson,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11, 20) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_CONFLICT");
  });
});

/**
 * İş 3 — TEACHER_UNAVAILABLE tek "soft warning" kodu: kullanıcı açıkça
 * onaylarsa (`allowAvailabilityOverride: true`) planlama devam eder ve
 * `slot.availabilityOverridden` işaretlenir. Diğer TÜM ihlaller (çakışma,
 * enstrüman/oda uyumsuzluğu vb.) override edilse bile hard block kalır.
 */
describe("validateLessonSlot — allowAvailabilityOverride (İş 3)", () => {
  it("varsayılan (override verilmeden) TEACHER_UNAVAILABLE hard block kalır", () => {
    const data = buildData({
      teacherAvailability: [{ dayOfWeek: 1, start: "09:00", end: "18:00" }],
    });
    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11) }
    );
    expect(result.ok).toBe(false);
  });

  it("allowAvailabilityOverride:true ile TEACHER_UNAVAILABLE atlanır ve slot.availabilityOverridden=true döner", () => {
    const data = buildData({
      teacherAvailability: [{ dayOfWeek: 1, start: "09:00", end: "18:00" }],
    });
    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11) },
      { allowAvailabilityOverride: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slot.availabilityOverridden).toBe(true);
  });

  it("müsait bir saatte allowAvailabilityOverride:true verilse bile availabilityOverridden=false kalır", () => {
    const data = buildData();
    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11) },
      { allowAvailabilityOverride: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slot.availabilityOverridden).toBe(false);
  });

  it("allowAvailabilityOverride:true olsa bile TEACHER_CONFLICT (çakışma) hard block kalır — override yalnızca müsaitlik için geçerlidir", () => {
    const data = buildData();
    const existingLesson = {
      id: "l1",
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene" as const,
      instrument: "Piyano" as const,
      startAt: nextSunday(11),
      endAt: nextSunday(11, 40),
      type: "regular" as const,
      status: "scheduled" as const,
    };
    const withLesson = { ...data, lessons: [existingLesson] };
    const result = validateLessonSlot(
      withLesson,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: "t1", roomId: "r1", startAt: nextSunday(11, 20) },
      { allowAvailabilityOverride: true }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_CONFLICT");
  });
});
