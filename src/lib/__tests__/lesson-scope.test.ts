import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSeedData } from "../seed";
import { narrowLessonScope, mergeLessonScope } from "../lesson-scope";
import { applyLessonScheduleUpdate } from "../lesson-update";
import type { AppData, Lesson } from "../types";

/**
 * P0 mutasyon performansı (2026-09-07) — dar dilim sözleşmesinin testleri.
 * Dilim, saf iş kurallarının (`applyLessonScheduleUpdate`, `applyLessonOpsFlag`,
 * kota) ihtiyaç duyduğu HER ŞEYİ içermeli; içermezse db modunda sessizce
 * yanlış karar verilir. Bu yüzden dilimin sınırları burada AÇIKÇA kilitlenir.
 */
const FIXED_NOW = new Date("2026-08-04T09:00:00"); // Salı — kapalı gün değil

beforeEach(() => {
  process.env.TZ = "Europe/Istanbul";
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function seed(): AppData {
  return createSeedData();
}

describe("narrowLessonScope", () => {
  it("bilinmeyen ders için null döner", () => {
    expect(narrowLessonScope(seed(), "yok_boyle_bir_ders")).toBeNull();
  });

  it("yalnız dersin öğretmenini, odasını ve öğrencisini taşır", () => {
    const data = seed();
    const lesson = data.lessons.find((l) => l.id === "l12")!;
    const scope = narrowLessonScope(data, "l12")!;

    expect(scope.teachers.map((t) => t.id)).toEqual([lesson.teacherId]);
    expect(scope.rooms.map((r) => r.id)).toEqual([lesson.roomId]);
    expect(scope.students.map((s) => s.id)).toEqual([lesson.studentId]);
    // Tam veride birden fazla öğretmen/oda/öğrenci var — dilim gerçekten dar.
    expect(data.teachers.length).toBeGreaterThan(1);
    expect(data.students.length).toBeGreaterThan(1);
  });

  it("dersin kendisini, öğrencinin TÜM derslerini ve aynı öğretmen/odanın hedef gün derslerini içerir", () => {
    const data = seed();
    const lesson = data.lessons.find((l) => l.id === "l12")!;
    const sameDayOtherLesson = data.lessons.find(
      (l) =>
        l.id !== lesson.id &&
        l.studentId !== lesson.studentId &&
        (l.teacherId === lesson.teacherId || l.roomId === lesson.roomId) &&
        new Date(l.startAt).toDateString() === new Date(lesson.startAt).toDateString()
    );
    const scope = narrowLessonScope(data, "l12")!;
    const ids = new Set(scope.lessons.map((l) => l.id));

    expect(ids.has("l12")).toBe(true);
    for (const own of data.lessons.filter((l) => l.studentId === lesson.studentId)) {
      expect(ids.has(own.id)).toBe(true);
    }
    if (sameDayOtherLesson) expect(ids.has(sameDayOtherLesson.id)).toBe(true);
  });

  it("ilgisiz bir dersi (başka öğrenci, başka öğretmen/oda, başka gün) DIŞARIDA bırakır", () => {
    const data = seed();
    const lesson = data.lessons.find((l) => l.id === "l12")!;
    const unrelated: Lesson = {
      ...lesson,
      id: "fake_unrelated",
      studentId: "__baska_ogrenci__",
      teacherId: "__baska_ogretmen__",
      roomId: "__baska_oda__",
      startAt: new Date(new Date(lesson.startAt).getTime() + 30 * 86400000).toISOString(),
      endAt: new Date(new Date(lesson.startAt).getTime() + 30 * 86400000 + 45 * 60000).toISOString(),
    };
    const withUnrelated = { ...data, lessons: [...data.lessons, unrelated] };
    const scope = narrowLessonScope(withUnrelated, "l12")!;
    expect(scope.lessons.map((l) => l.id)).not.toContain("fake_unrelated");
  });

  it("hedef gün verildiğinde O günün öğretmen/oda derslerini de içerir (çakışma kontrolü)", () => {
    const data = seed();
    const lesson = data.lessons.find((l) => l.id === "l12")!;
    const target = new Date(new Date(lesson.startAt).getTime() + 7 * 86400000);
    const blocker: Lesson = {
      ...lesson,
      id: "fake_blocker",
      studentId: "__baska_ogrenci__",
      startAt: target.toISOString(),
      endAt: new Date(target.getTime() + 45 * 60000).toISOString(),
    };
    const withBlocker = { ...data, lessons: [...data.lessons, blocker] };

    const withoutTarget = narrowLessonScope(withBlocker, "l12")!;
    expect(withoutTarget.lessons.map((l) => l.id)).not.toContain("fake_blocker");

    const withTarget = narrowLessonScope(withBlocker, "l12", target.toISOString())!;
    expect(withTarget.lessons.map((l) => l.id)).toContain("fake_blocker");
  });

  it("dar dilim, tam veriyle AYNI çakışma kararını verir (kural dilim dışına bakmıyor)", () => {
    const data = seed();
    const l12 = data.lessons.find((l) => l.id === "l12")!;
    const l14 = data.lessons.find((l) => l.id === "l14")!; // aynı öğretmen/oda, farklı gün
    const input = { lessonId: "l12", startAt: l14.startAt };

    const full = applyLessonScheduleUpdate(data, input, FIXED_NOW);
    const scoped = applyLessonScheduleUpdate(
      narrowLessonScope(data, "l12", l14.startAt)!,
      input,
      FIXED_NOW
    );
    expect(scoped.ok).toBe(full.ok);
    if (!full.ok && !scoped.ok) expect(scoped.code).toBe(full.code);
  });
});

describe("mergeLessonScope", () => {
  it("değişmemiş dilimi geri birleştirmek satır sayılarını korur", () => {
    const data = seed();
    const scope = narrowLessonScope(data, "l12")!;
    const merged = mergeLessonScope(data, scope, "l12");

    expect(merged.lessons).toHaveLength(data.lessons.length);
    expect(merged.attendances).toHaveLength(data.attendances.length);
    expect(merged.makeupRequests).toHaveLength(data.makeupRequests.length);
    expect(merged.payments).toHaveLength(data.payments.length);
  });

  it("dilim dışındaki satırlara dokunmaz, dilim içindeki değişikliği uygular", () => {
    const data = seed();
    const scope = narrowLessonScope(data, "l12")!;
    const movedStart = new Date(new Date(scope.lessons[0]!.startAt).getTime() + 3600000).toISOString();
    const changed: AppData = {
      ...scope,
      lessons: scope.lessons.map((l) => (l.id === "l12" ? { ...l, startAt: movedStart } : l)),
    };
    const merged = mergeLessonScope(data, changed, "l12");

    expect(merged.lessons.find((l) => l.id === "l12")!.startAt).toBe(movedStart);
    const untouched = data.lessons.find((l) => !scope.lessons.some((s) => s.id === l.id));
    if (untouched) {
      expect(merged.lessons.find((l) => l.id === untouched.id)).toEqual(untouched);
    }
  });
});
