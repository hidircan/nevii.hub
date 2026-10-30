import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addDays } from "date-fns";
import { confirmMakeupSlot, suggestMakeupSlots, validateLessonSlot } from "../makeup-engine";
import { createSeedData } from "../seed";
import type { AppData, Lesson } from "../types";


// Seed dersleri ve göreli tarihler "bugün"e göre üretilir; gün kapalı güne/geçmişe/müsaitlik dışına düşünce test
// takvime bağlı kırılıyordu (2026-10 CI baseline). Saat, dönem içi ve tatilsiz bir SALI sabahına (6 Ekim 2026) dondurulur.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T06:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const NOW = new Date("2026-10-06T06:00:00.000Z");

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Fixture'ın çalışma günleri Salı–Cuma. 2026-09-20: Pazartesi Güz döneminin
 * KAPALI günü olduğu için artık hiçbir ders (telafi dahil) o güne
 * planlanamaz — bkz. src/lib/work-days.ts.
 */
function nextWorkingDayOffset(minOffset: number): number {
  for (let offset = minOffset; offset <= minOffset + 10; offset++) {
    const dow = new Date(at(offset, 12)).getDay();
    if (dow >= 2 && dow <= 5) return offset;
  }
  throw new Error("no working day found within range");
}

function nextDayOffsetForWeekday(targetDow: number, from = 1): number {
  for (let offset = from; offset <= from + 14; offset++) {
    if (new Date(at(offset, 12)).getDay() === targetDow) return offset;
  }
  throw new Error("no matching weekday found within range");
}

function buildFixture(): AppData {
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
      makeupWindowDays: 30,
      lessonDurationMinutes: 45,
      workingHours: { start: "09:00", end: "18:00" },
      workingDays: [1, 2, 3, 4, 5],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [
        { id: "erzene", name: "Erzene", shortName: "Erzene", address: "", phone: "", city: "İzmir" },
      ],
    },
    teachers: [
      {
        id: "t1",
        name: "Nilüfer",
        email: "",
        phone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        availability: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, start: "09:00", end: "18:00" })),
        maxDailyLessons: 8,
        active: true,
        color: "#000",
      },
      {
        id: "t2",
        name: "Alternatif",
        email: "",
        phone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        availability: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, start: "09:00", end: "18:00" })),
        maxDailyLessons: 8,
        active: true,
        color: "#111",
      },
    ],
    students: [
      {
        id: "s1",
        name: "Zeynep",
        email: "",
        phone: "",
        parentName: "Veli",
        parentPhone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        teacherId: "t1",
        packageName: "P",
        weeklyLessonCount: 1,
        monthlyFee: 3000,
        active: true,
        notes: "",
        createdAt: at(-90, 9),
      },
    ],
    rooms: [
      { id: "r1", name: "Stüdyo 1", branchId: "erzene", capacity: 2, instruments: ["Piyano"] },
      { id: "r2", name: "Stüdyo 2", branchId: "erzene", capacity: 2, instruments: ["Piyano"] },
    ],
    lessons: [],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [
      {
        id: "mk1",
        studentId: "s1",
        teacherId: "t1",
        branchId: "erzene",
        instrument: "Piyano",
        sourceLessonId: "l0",
        attendanceId: "a0",
        status: "pending",
        reason: "Öğretmen hastalık izni",
        expiresAt: addDays(NOW, 30).toISOString(),
        suggestedSlots: [],
        createdAt: at(-1, 10),
        policyNote: "test",
      },
    ],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
  };
}

describe("makeup-engine · manuel telafi planlama validasyonu", () => {
  it("ilk öneri listesinde olmayan ama kurallara uygun gelecek slot elle onaylanır", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];

    const defaultSuggestions = suggestMakeupSlots(data, request, { maxSlots: 6 });
    const offset = nextWorkingDayOffset(20);
    const startAt = at(offset, 15, 0);
    expect(defaultSuggestions.some((s) => s.startAt === startAt)).toBe(false);

    const validation = validateLessonSlot(data, request, {
      teacherId: "t1",
      roomId: "r1",
      startAt,
    });
    expect(validation.ok).toBe(true);

    const { data: next, lessonId } = confirmMakeupSlot(
      data,
      request.id,
      { teacherId: "t1", roomId: "r1", startAt },
      { decisionNote: "Manuel plan", decidedBy: "admin1" }
    );
    const lesson = next.lessons.find((l) => l.id === lessonId);
    expect(lesson).toBeDefined();
    expect(lesson?.type).toBe("makeup");
    expect(lesson?.status).toBe("scheduled");
    expect(lesson?.makeupRequestId).toBe(request.id);

    const updated = next.makeupRequests.find((m) => m.id === request.id);
    expect(updated?.status).toBe("confirmed");
    expect(updated?.confirmedLessonId).toBe(lessonId);
  });

  it("öğretmen çakışması olan slot reddedilir", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];
    const offset = nextWorkingDayOffset(3);
    const startAt = at(offset, 11, 0);
    const conflict: Lesson = {
      id: "conflict-teacher",
      studentId: "other-student",
      teacherId: "t1",
      roomId: "r2",
      branchId: "erzene",
      instrument: "Piyano",
      startAt,
      endAt: at(offset, 11, 45),
      type: "regular",
      status: "scheduled",
    };
    data.lessons.push(conflict);

    const result = validateLessonSlot(data, request, { teacherId: "t1", roomId: "r1", startAt });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_CONFLICT");
  });

  it("öğrenci çakışması olan slot reddedilir", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];
    const offset = nextWorkingDayOffset(3);
    const startAt = at(offset, 11, 0);
    const conflict: Lesson = {
      id: "conflict-student",
      studentId: "s1",
      teacherId: "t2",
      roomId: "r2",
      branchId: "erzene",
      instrument: "Piyano",
      startAt,
      endAt: at(offset, 11, 45),
      type: "regular",
      status: "scheduled",
    };
    data.lessons.push(conflict);

    const result = validateLessonSlot(data, request, { teacherId: "t1", roomId: "r1", startAt });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("STUDENT_CONFLICT");
  });

  it("oda çakışması olan slot reddedilir", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];
    const offset = nextWorkingDayOffset(3);
    const startAt = at(offset, 11, 0);
    const conflict: Lesson = {
      id: "conflict-room",
      studentId: "other-student",
      teacherId: "t2",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      startAt,
      endAt: at(offset, 11, 45),
      type: "regular",
      status: "scheduled",
    };
    data.lessons.push(conflict);

    const result = validateLessonSlot(data, request, { teacherId: "t1", roomId: "r1", startAt });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ROOM_CONFLICT");
  });

  it("öğretmen availability dışındaki saat reddedilir", () => {
    const data = buildFixture();
    // Pazartesi (dayOfWeek 1) artık kapalı gün; senaryo öğretmen müsaitliğini sınadığı için Salı kullanılır.
    data.teachers[0].availability = [{ dayOfWeek: 2, start: "09:00", end: "12:00" }];
    const request = data.makeupRequests[0];
    const workdayOffset = nextDayOffsetForWeekday(2, 3);
    const startAt = at(workdayOffset, 16, 0);

    const result = validateLessonSlot(data, request, { teacherId: "t1", roomId: "r1", startAt });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_UNAVAILABLE");
  });

  it("telafi son kullanım tarihinden sonraki slot reddedilir", () => {
    const data = buildFixture();
    const request = { ...data.makeupRequests[0], expiresAt: at(5, 23, 59) };
    data.makeupRequests = [request];
    const offset = nextWorkingDayOffset(10);
    const startAt = at(offset, 11, 0);

    const result = validateLessonSlot(data, request, { teacherId: "t1", roomId: "r1", startAt });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AFTER_EXPIRY");
  });

  it("çift onay ikinci ders oluşturmaz (manuel planlama sonrası)", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];
    const offset = nextWorkingDayOffset(3);
    const firstStart = at(offset, 11, 0);
    const secondStart = at(offset, 13, 0);

    const { data: confirmed } = confirmMakeupSlot(
      data,
      request.id,
      { teacherId: "t1", roomId: "r1", startAt: firstStart },
      { decisionNote: "İlk onay", decidedBy: "admin1" }
    );
    const lessonCountAfterFirst = confirmed.lessons.length;

    expect(() =>
      confirmMakeupSlot(
        confirmed,
        request.id,
        { teacherId: "t1", roomId: "r1", startAt: secondStart },
        { decisionNote: "İkinci onay", decidedBy: "admin1" }
      )
    ).toThrow("Bu telafi talebi zaten sonuçlandırılmış.");
    expect(confirmed.lessons.length).toBe(lessonCountAfterFirst);
  });
});

describe("makeup-engine · demo senaryosu (Lara) uçtan uca manuel planlama", () => {
  it("Lara: açık telafi -> öneri dışı ama uygun saat -> elle planla -> Program/veli onay koşulunu sağlar", () => {
    const seed = createSeedData();
    const laraRequest = seed.makeupRequests.find((m) => m.studentId === "s5");
    expect(laraRequest).toBeDefined();
    expect(laraRequest?.status).toBe("pending");

    const defaultSuggestions = suggestMakeupSlots(seed, laraRequest!, { maxSlots: 6 });

    let targetStart: string | null = null;
    for (let offset = 10; offset >= 1 && !targetStart; offset--) {
      const candidate = at(offset, 11, 0);
      if (defaultSuggestions.some((s) => s.startAt === candidate)) continue;
      const check = validateLessonSlot(seed, laraRequest!, {
        teacherId: laraRequest!.teacherId,
        roomId: "r1",
        startAt: candidate,
      });
      if (check.ok) targetStart = candidate;
    }
    expect(targetStart).not.toBeNull();

    const { data: next, lessonId } = confirmMakeupSlot(
      seed,
      laraRequest!.id,
      { teacherId: laraRequest!.teacherId, roomId: "r1", startAt: targetStart! },
      { decisionNote: "Lara için manuel plan", decidedBy: "admin1" }
    );

    const lesson = next.lessons.find((l) => l.id === lessonId);
    expect(lesson).toBeDefined();
    expect(lesson?.type).toBe("makeup");
    expect(lesson?.status).toBe("scheduled");
    // Program ekranı bugün/gelecek dersleri gösterir; veli portalı onaylı telafiyi
    // yalnızca ders gelecekteyse öne çıkarır.
    expect(new Date(lesson!.startAt).getTime()).toBeGreaterThan(Date.now());

    const updatedRequest = next.makeupRequests.find((m) => m.id === laraRequest!.id);
    expect(updatedRequest?.status).toBe("confirmed");
    expect(updatedRequest?.confirmedLessonId).toBe(lessonId);
  });
});
