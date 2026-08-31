import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSeedData } from "../seed";
import { applyLessonScheduleUpdate, applyLessonCancel } from "../lesson-update";
import type { Lesson } from "../types";

const FIXED_NOW = new Date("2026-08-03T09:00:00");

beforeEach(() => {
  process.env.TZ = "Europe/Istanbul";
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("applyLessonScheduleUpdate · taşıma (drag)", () => {
  it("geçerli yeni başlangıca taşınan ders doğru startAt ve korunmuş süreyle doğru endAt alır", () => {
    const data = createSeedData();
    const lesson = data.lessons.find((l) => l.id === "l12")!; // s1,t1,r1,Piyano — 45 dk
    const newStartAt = new Date(new Date(lesson.startAt).getTime() + 60 * 60 * 1000).toISOString(); // +1 saat sonra

    const result = applyLessonScheduleUpdate(data, { lessonId: "l12", startAt: newStartAt }, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lesson.startAt).toBe(newStartAt);
      const durationMs = new Date(result.lesson.endAt).getTime() - new Date(result.lesson.startAt).getTime();
      expect(durationMs).toBe(45 * 60 * 1000);
    }
  });

  it("öğretmen/oda çakışması yaratan taşıma reddedilir; ders eski hâliyle kalır", () => {
    const data = createSeedData();
    const l12 = data.lessons.find((l) => l.id === "l12")!; // t1,r1
    const l14 = data.lessons.find((l) => l.id === "l14")!; // t1,r1 — aynı öğretmen/oda, farklı gün/saat

    const result = applyLessonScheduleUpdate(data, { lessonId: "l12", startAt: l14.startAt }, FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["TEACHER_CONFLICT", "ROOM_CONFLICT"]).toContain(result.code);

    // Girdi verisi mutasyona uğramamış olmalı
    expect(data.lessons.find((l) => l.id === "l12")!.startAt).toBe(l12.startAt);
  });

  it("öğretmenin müsaitlik penceresi dışına taşıma reddedilir (TEACHER_UNAVAILABLE)", () => {
    // Test verisi düzeltmesi (2026-08-31): seed'deki l11 artık t2/r6/Bağlama
    // taşıyor — r6 yalnızca "Bateri" destekliyor (ROOM_INSTRUMENT_MISMATCH ile
    // zaten tutarsız bir fixture) ve t2 Pazartesi zaten müsait — bu senaryonun
    // amacına (Pazartesi müsait olmayan bir öğretmen) uymuyordu. Aynı senaryoyu
    // t4 "Şevval Aydın" (Piyano/Şan/Yan Flüt, yalnız Salı–Cumartesi müsait) ve
    // onun gerçekten verdiği bir dersle (r4, Piyano) kurar — geçerli bir dersten
    // (l12) türetilir, seed'e tutarsız veri EKLEMEZ.
    const base = createSeedData();
    const template = base.lessons.find((l) => l.id === "l12")!;
    const movable: Lesson = {
      ...template,
      id: "fake_teacher_unavailable_move",
      teacherId: "t4",
      roomId: "r4",
      branchId: "evka3",
      instrument: "Piyano",
    };
    const data = { ...base, lessons: [...base.lessons, movable] };

    let mondayOffset = -1;
    for (let d = 1; d <= 14; d++) {
      const day = new Date(FIXED_NOW);
      day.setDate(day.getDate() + d);
      if (day.getDay() === 1) {
        mondayOffset = d;
        break;
      }
    }
    const day = new Date(FIXED_NOW);
    day.setDate(day.getDate() + mondayOffset);
    day.setHours(15, 0, 0, 0);

    const result = applyLessonScheduleUpdate(
      data,
      { lessonId: "fake_teacher_unavailable_move", startAt: day.toISOString() },
      FIXED_NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_UNAVAILABLE");
  });

  it("tamamlanmış ders taşınamaz (LESSON_NOT_EDITABLE)", () => {
    const data = createSeedData();
    const lesson = data.lessons.find((l) => l.id === "l7")!; // status: completed
    expect(lesson.status).toBe("completed");
    const result = applyLessonScheduleUpdate(
      data,
      { lessonId: "l7", startAt: new Date(FIXED_NOW.getTime() + 86400000).toISOString() },
      FIXED_NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LESSON_NOT_EDITABLE");
  });

  it("iptal edilmiş ders taşınamaz (LESSON_NOT_EDITABLE)", () => {
    const data = createSeedData();
    const lesson = data.lessons.find((l) => l.id === "l4")!; // status: cancelled
    expect(lesson.status).toBe("cancelled");
    const result = applyLessonScheduleUpdate(
      data,
      { lessonId: "l4", startAt: new Date(FIXED_NOW.getTime() + 86400000).toISOString() },
      FIXED_NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LESSON_NOT_EDITABLE");
  });

  it("telafi (makeup) dersi taşınamaz (LESSON_NOT_EDITABLE)", () => {
    const data = createSeedData();
    const base = data.lessons.find((l) => l.id === "l12")!;
    const makeupLesson: Lesson = { ...base, id: "fake_makeup", type: "makeup" };
    const withMakeup = { ...data, lessons: [...data.lessons, makeupLesson] };

    const result = applyLessonScheduleUpdate(
      withMakeup,
      { lessonId: "fake_makeup", startAt: new Date(FIXED_NOW.getTime() + 172800000).toISOString() },
      FIXED_NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LESSON_NOT_EDITABLE");
  });

  it("geçmişte kalan (startAt < now) bir ders taşınamaz", () => {
    const data = createSeedData();
    const base = data.lessons.find((l) => l.id === "l12")!;
    const pastLesson: Lesson = {
      ...base,
      id: "fake_past",
      startAt: new Date(FIXED_NOW.getTime() - 3600000).toISOString(),
      endAt: new Date(FIXED_NOW.getTime() - 3600000 + 45 * 60000).toISOString(),
      status: "scheduled",
    };
    const withPast = { ...data, lessons: [...data.lessons, pastLesson] };

    const result = applyLessonScheduleUpdate(
      withPast,
      { lessonId: "fake_past", startAt: new Date(FIXED_NOW.getTime() + 3600000).toISOString() },
      FIXED_NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LESSON_NOT_EDITABLE");
  });
});

describe("applyLessonScheduleUpdate · süre değiştirme (resize)", () => {
  it("30 dakikanın katı olmayan / 30 dakikadan kısa süre reddedilir (INVALID_DURATION)", () => {
    const data = createSeedData();
    const result = applyLessonScheduleUpdate(data, { lessonId: "l12", durationMinutes: 20 }, FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_DURATION");
  });

  it("geçerli yeni süreyle başarılı resize endAt'i doğru günceller, startAt sabit kalır", () => {
    const data = createSeedData();
    const lesson = data.lessons.find((l) => l.id === "l12")!;
    const result = applyLessonScheduleUpdate(data, { lessonId: "l12", durationMinutes: 90 }, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Aynı an, farklı ISO gösterimi olabilir (offset vs. "Z") — instant'ı karşılaştır.
      expect(new Date(result.lesson.startAt).getTime()).toBe(new Date(lesson.startAt).getTime());
      const durationMs = new Date(result.lesson.endAt).getTime() - new Date(result.lesson.startAt).getTime();
      expect(durationMs).toBe(90 * 60 * 1000);
    }
  });

  it("çakışma yaratan resize reddedilir; eski endAt korunur", () => {
    const data = createSeedData();
    const l12 = data.lessons.find((l) => l.id === "l12")!; // t1,r1, 14:00–14:45
    const blocker: Lesson = {
      ...l12,
      id: "fake_blocker",
      startAt: new Date(new Date(l12.startAt).getTime() + 60 * 60000).toISOString(), // 15:00
      endAt: new Date(new Date(l12.startAt).getTime() + 105 * 60000).toISOString(), // 15:45
    };
    const withBlocker = { ...data, lessons: [...data.lessons, blocker] };

    // 14:00 başlayıp 90 dk sürerse 15:30'a kadar sürer — 15:00 blocker'la çakışır
    const result = applyLessonScheduleUpdate(withBlocker, { lessonId: "l12", durationMinutes: 90 }, FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["TEACHER_CONFLICT", "ROOM_CONFLICT"]).toContain(result.code);
    expect(data.lessons.find((l) => l.id === "l12")!.endAt).toBe(l12.endAt);
  });

  it("tamamlanmış/iptal/telafi/geçmiş dersler resize edilemez", () => {
    const data = createSeedData();
    const completed = applyLessonScheduleUpdate(data, { lessonId: "l7", durationMinutes: 60 }, FIXED_NOW);
    expect(completed.ok).toBe(false);
    if (!completed.ok) expect(completed.code).toBe("LESSON_NOT_EDITABLE");

    const cancelled = applyLessonScheduleUpdate(data, { lessonId: "l4", durationMinutes: 60 }, FIXED_NOW);
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.code).toBe("LESSON_NOT_EDITABLE");
  });
});

describe("applyLessonCancel", () => {
  it("planlanmış normal bir dersi iptal eder", () => {
    const data = createSeedData();
    const result = applyLessonCancel(data, "l12");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lesson.status).toBe("cancelled");
  });

  it("zaten tamamlanmış/iptal edilmiş dersi tekrar iptal etmez (LESSON_NOT_EDITABLE)", () => {
    const data = createSeedData();
    const result = applyLessonCancel(data, "l4"); // zaten cancelled
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LESSON_NOT_EDITABLE");
  });

  it("telafi dersini iptal etmez (LESSON_NOT_EDITABLE)", () => {
    const data = createSeedData();
    const base = data.lessons.find((l) => l.id === "l12")!;
    const makeupLesson: Lesson = { ...base, id: "fake_makeup_cancel", type: "makeup" };
    const withMakeup = { ...data, lessons: [...data.lessons, makeupLesson] };
    const result = applyLessonCancel(withMakeup, "fake_makeup_cancel");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LESSON_NOT_EDITABLE");
  });
});
