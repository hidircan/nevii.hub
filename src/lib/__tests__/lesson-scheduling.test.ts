import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { createSeedData } from "../seed";
import { validateLessonSlot } from "../makeup-engine";
import { suggestLessonSlots } from "../lesson-scheduling";
import type { AppData, Lesson } from "../types";

const FIXED_NOW = new Date("2026-08-03T09:00:00");

beforeEach(() => {
  process.env.TZ = "Europe/Istanbul";
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("suggestLessonSlots", () => {
  it("önerilen saatler öğrenci/öğretmen/oda çakışması üretmez", () => {
    const data = createSeedData();
    const suggestions = suggestLessonSlots(data, { studentId: "s5", instrument: "Şan" }, FIXED_NOW);
    expect(suggestions.length).toBeGreaterThan(0);

    // Her öneri, öneri üretildiği anki gerçek veriye karşı bağımsızca yeniden
    // doğrulanabilir olmalı — yani hiçbir öneri var olan bir ders (öğrenci,
    // öğretmen veya oda) ile çakışmaz. (Önerilerin BİRBİRİYLE çakışması sorun
    // değildir — bunlar alternatif seçeneklerdir, admin yalnızca birini seçer.)
    for (const s of suggestions) {
      const check = validateLessonSlot(
        data,
        { instrument: "Şan", studentId: "s5" },
        { teacherId: s.teacherId, roomId: s.roomId, startAt: s.startAt },
        { now: FIXED_NOW }
      );
      expect(check.ok).toBe(true);
    }
  });

  it("öğrencinin mevcut öğretmeni en üstteki önerilerde öne çıkar", () => {
    const data = createSeedData();
    const suggestions = suggestLessonSlots(data, { studentId: "s5", instrument: "Şan" }, FIXED_NOW);
    expect(suggestions[0].reasons).toContain("Öğrencinin mevcut öğretmeni");
  });
});

describe("validateLessonSlot · sıradan ders planlama (telafi dışı)", () => {
  it("öğretmenin müsaitlik penceresi dışındaki saat reddedilir (TEACHER_UNAVAILABLE)", () => {
    const data = createSeedData();
    // Test verisi düzeltmesi (2026-08-31): t4 artık "Mert Öztürk"/Bateri değil —
    // seed.ts'de t4 = "Şevval Aydın" (Piyano/Şan/Yan Flüt, evka3, yalnız
    // Salı–Cumartesi müsait, Pazartesi değil). Eski senaryo "Bateri" enstrümanı
    // istiyordu ki bu artık t4'ün öğrettiği bir enstrüman değil — bu da
    // TEACHER_UNAVAILABLE'a ulaşmadan TEACHER_INSTRUMENT_MISMATCH'e düşüyordu
    // (bkz. makeup-engine.ts kontrol sırası: enstrüman → oda → müsaitlik).
    // Senaryonun asıl amacı (Pazartesi müsait olmayan bir öğretmen) korunur —
    // yalnızca enstrüman/oda t4'ün GERÇEK verdiği derse (Piyano, r4) güncellendi.
    let mondayOffset = -1;
    for (let d = 1; d <= 14; d++) {
      const day = addDays(startOfDay(FIXED_NOW), d);
      if (day.getDay() === 1) {
        mondayOffset = d;
        break;
      }
    }
    expect(mondayOffset).toBeGreaterThan(0);
    const day = addDays(startOfDay(FIXED_NOW), mondayOffset);
    const startAt = setMinutes(setHours(day, 15), 0).toISOString();

    const result = validateLessonSlot(
      data,
      { instrument: "Piyano", studentId: "s4" },
      { teacherId: "t4", roomId: "r4", startAt },
      { now: FIXED_NOW }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TEACHER_UNAVAILABLE");
  });

  it("oda çakışması olan sıradan ders reddedilir (ROOM_CONFLICT)", () => {
    const base = createSeedData();
    const [suggestion] = suggestLessonSlots(base, { studentId: "s1", instrument: "Piyano" }, FIXED_NOW);
    expect(suggestion).toBeDefined();

    const existing: Lesson = {
      id: "fake_room_conflict",
      studentId: "s2",
      teacherId: "sentinel_other_teacher",
      roomId: suggestion.roomId,
      branchId: suggestion.branchId,
      instrument: "Piyano",
      startAt: suggestion.startAt,
      endAt: suggestion.endAt,
      type: "regular",
      status: "scheduled",
    };
    const dataWithConflict: AppData = { ...base, lessons: [...base.lessons, existing] };

    const result = validateLessonSlot(
      dataWithConflict,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: suggestion.teacherId, roomId: suggestion.roomId, startAt: suggestion.startAt },
      { now: FIXED_NOW }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ROOM_CONFLICT");
  });

  it("öğrenci çakışması olan sıradan ders reddedilir (STUDENT_CONFLICT)", () => {
    const base = createSeedData();
    const [suggestion] = suggestLessonSlots(base, { studentId: "s1", instrument: "Piyano" }, FIXED_NOW);
    expect(suggestion).toBeDefined();

    const existing: Lesson = {
      id: "fake_student_conflict",
      studentId: "s1",
      teacherId: "sentinel_other_teacher",
      roomId: "sentinel_other_room",
      branchId: suggestion.branchId,
      instrument: "Piyano",
      startAt: suggestion.startAt,
      endAt: suggestion.endAt,
      type: "regular",
      status: "scheduled",
    };
    const dataWithConflict: AppData = { ...base, lessons: [...base.lessons, existing] };

    const result = validateLessonSlot(
      dataWithConflict,
      { instrument: "Piyano", studentId: "s1" },
      { teacherId: suggestion.teacherId, roomId: suggestion.roomId, startAt: suggestion.startAt },
      { now: FIXED_NOW }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("STUDENT_CONFLICT");
  });
});
