import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";
import { confirmMakeupSlot, suggestMakeupSlots } from "../makeup-engine";
import type { AppData, MakeupRequest, MakeupSlot } from "../types";

const NOW = new Date();

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * 2026-09-20 — fixture'ın çalışma günü Pazartesi'den SALI'ya (dayOfWeek 2)
 * alındı: Pazartesi artık Güz döneminin kapalı günü olduğu için hiçbir ders
 * (telafi dahil) o güne planlanamaz (bkz. src/lib/work-days.ts). Testlerin
 * amacı telafi öneri/onay mantığı; kapalı gün kuralı ayrı test edilir
 * (work-days-override.test.ts).
 */
function nextDayOffsetForWeekday(targetDow: number): number {
  for (let offset = 1; offset <= 14; offset++) {
    const d = new Date(NOW);
    d.setDate(d.getDate() + offset);
    if (d.getDay() === targetDow) return offset;
  }
  throw new Error("no matching weekday found within range");
}

function buildFixture(overrides?: { extraLesson?: Partial<AppData> }): AppData {
  const lesson = {
    id: "l1",
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene" as const,
    instrument: "Piyano" as const,
    startAt: at(1, 11, 0),
    endAt: at(1, 11, 45),
    type: "regular" as const,
    status: "scheduled" as const,
  };

  const request: MakeupRequest = {
    id: "mk1",
    studentId: "s1",
    teacherId: "t1",
    branchId: "erzene",
    instrument: "Piyano",
    sourceLessonId: "l0",
    attendanceId: "a0",
    status: "pending",
    reason: "Öğretmen hastalık izni",
    expiresAt: addDays(NOW, 60).toISOString(),
    suggestedSlots: [],
    createdAt: at(-2, 10),
    policyNote: "test",
  };

  const data: AppData = {
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
      lessonDurationMinutes: 45,
      workingHours: { start: "10:00", end: "14:00" },
      // 2026-09-20 — Salı (2): Pazartesi artık Güz döneminin kapalı günü.
      workingDays: [2],
      currency: "TRY",
      feeRoundingMode: "exact_minutes",
      branches: [
        {
          id: "erzene",
          name: "Erzene",
          shortName: "Erzene",
          address: "",
          phone: "",
          city: "İzmir",
        },
      ],
    },
    teachers: [
      {
        id: "t1",
        name: "Nilüfer",
        email: "t1@test.com",
        phone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        availability: [{ dayOfWeek: 2, start: "10:00", end: "14:00" }],
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
        parentName: "Veli",
        parentPhone: "",
        branchId: "erzene",
        instruments: ["Piyano"],
        teacherId: "t1",
        packageName: "Bireysel Aylık",
        weeklyLessonCount: 1,
        monthlyFee: 3000,
        active: true,
        notes: "",
        createdAt: at(-90, 9),
      },
    ],
    rooms: [
      {
        id: "r1",
        name: "Stüdyo 1",
        branchId: "erzene",
        capacity: 2,
        instruments: ["Piyano"],
      },
    ],
    lessons: overrides?.extraLesson?.lessons ?? [lesson],
    lessonSeries: [],
    attendances: [],
    makeupRequests: [request],
    payments: [],
    teacherFeeRules: [],
    teacherPayouts: [],
  };
  return data;
}

describe("makeup-engine · suggestMakeupSlots", () => {
  it("uygun slotlar üretir ve skora göre sıralar", () => {
    const data = buildFixture();
    const slots = suggestMakeupSlots(data, data.makeupRequests[0], {
      maxSlots: 3,
      daysAhead: 14,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(3);
    for (const s of slots) {
      expect(s.teacherId).toBe("t1");
      expect(s.roomId).toBe("r1");
      expect(s.branchId).toBe("erzene");
      expect(new Date(s.startAt) > NOW).toBe(true);
      expect(s.score).toBeGreaterThan(0);
    }
    const scores = slots.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("mevcut dersle çakışan saatleri üretmez", () => {
    const data = buildFixture({
      extraLesson: {
        lessons: [
          {
            id: "l1",
            studentId: "s1",
            teacherId: "t1",
            roomId: "r1",
            branchId: "erzene",
            instrument: "Piyano",
            startAt: at(1, 11, 0),
            endAt: at(1, 11, 45),
            type: "regular",
            status: "scheduled",
          },
        ],
      },
    });

    const slots = suggestMakeupSlots(data, data.makeupRequests[0], {
      maxSlots: 20,
      daysAhead: 14,
    });
    const day1Slots = slots.filter((s) => s.startAt.startsWith(at(1, 0, 0).slice(0, 10)));
    for (const s of day1Slots) {
      const start = new Date(s.startAt).getTime();
      const end = new Date(s.endAt).getTime();
      const busyStart = new Date(at(1, 11, 0)).getTime();
      const busyEnd = new Date(at(1, 11, 45)).getTime();
      const overlap = start < busyEnd && busyStart < end;
      expect(overlap).toBe(false);
    }
  });

  it("öğretmen müsait değilse slot üretmez", () => {
    const data = buildFixture();
    data.teachers[0].availability = [{ dayOfWeek: 2, start: "08:00", end: "09:00" }];
    const slots = suggestMakeupSlots(data, data.makeupRequests[0], {
      maxSlots: 3,
      daysAhead: 14,
    });
    expect(slots.length).toBe(0);
  });

  it("aktif olmayan öğretmen slot üretmez", () => {
    const data = buildFixture();
    data.teachers[0].active = false;
    const slots = suggestMakeupSlots(data, data.makeupRequests[0], {
      maxSlots: 3,
      daysAhead: 14,
    });
    expect(slots.length).toBe(0);
  });

  it("enstrüman uyumu olmayan öğretmen slot üretmez", () => {
    const data = buildFixture();
    data.teachers[0].instruments = ["Gitar"];
    const slots = suggestMakeupSlots(data, data.makeupRequests[0], {
      maxSlots: 3,
      daysAhead: 14,
    });
    expect(slots.length).toBe(0);
  });
});

const DECISION = { decisionNote: "Test onayı", decidedBy: "admin1" };

describe("makeup-engine · confirmMakeupSlot", () => {
  it("ders oluşturur ve talebi confirmed yapar (EPIC 10: karar bilgisi + SLA de yazılır)", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];
    const workdayOffset = nextDayOffsetForWeekday(2);
    const slot: MakeupSlot = {
      startAt: at(workdayOffset, 10, 0),
      endAt: at(workdayOffset, 10, 45),
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      score: 90,
      reasons: ["Aynı öğretmen"],
    };

    const { data: next, lessonId } = confirmMakeupSlot(data, request.id, slot, DECISION);

    const lesson = next.lessons.find((l) => l.id === lessonId);
    expect(lesson).toBeDefined();
    expect(lesson?.type).toBe("makeup");
    expect(lesson?.status).toBe("scheduled");
    expect(lesson?.makeupRequestId).toBe(request.id);
    expect(lesson?.studentId).toBe("s1");

    const updated = next.makeupRequests.find((m) => m.id === request.id);
    expect(updated?.status).toBe("confirmed");
    expect(updated?.confirmedLessonId).toBe(lessonId);
    expect(updated?.decisionNote).toBe(DECISION.decisionNote);
    expect(updated?.decidedBy).toBe(DECISION.decidedBy);
    expect(updated?.decidedAt).toBeDefined();
    expect(updated?.slaDeadline).toBeDefined();
    expect(updated?.slaEscalationLevel).toBe(0);
  });

  it("var olmayan talep için hata fırlatır", () => {
    const data = buildFixture();
    const slot: MakeupSlot = {
      startAt: at(8, 10, 0),
      endAt: at(8, 10, 45),
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      score: 90,
      reasons: [],
    };
    expect(() => confirmMakeupSlot(data, "missing", slot, DECISION)).toThrow(
      "Telafi talebi bulunamadı"
    );
  });

  it("zaten onaylanmış talebi tekrar onaylatmaz (çift onay koruması)", () => {
    const data = buildFixture();
    const request = data.makeupRequests[0];
    const workdayOffset = nextDayOffsetForWeekday(2);
    const slot: MakeupSlot = {
      startAt: at(workdayOffset, 10, 0),
      endAt: at(workdayOffset, 10, 45),
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      score: 90,
      reasons: ["Aynı öğretmen"],
    };

    const { data: confirmed } = confirmMakeupSlot(data, request.id, slot, DECISION);
    const lessonCountAfterFirst = confirmed.lessons.length;

    expect(() => confirmMakeupSlot(confirmed, request.id, slot, DECISION)).toThrow(
      "Bu telafi talebi zaten sonuçlandırılmış"
    );
    expect(confirmed.lessons.length).toBe(lessonCountAfterFirst);
  });
});
