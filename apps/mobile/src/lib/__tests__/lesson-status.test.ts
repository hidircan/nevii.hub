import { describe, it, expect } from "vitest";
import { lessonStatusBadge, studentFacingLessonStatus } from "../lesson-status";
import type { Lesson } from "../../types/api";

function baseLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    startAt: "2020-01-01T09:00:00.000Z",
    endAt: "2020-01-01T10:00:00.000Z",
    status: "scheduled",
    ...overrides,
  };
}

/**
 * Web yönetici paneli tek kaynak: `resolveLessonFinalStatus`
 * (src/lib/lesson-live-status.ts) + `LessonStatusBadge` PRESENTATION.
 * Mobil `attendanceStatusForLesson` bunun 1:1 port'u — panelin 6 statüsün
 * dışında görünen statü ÜRETİLMEZ ("Mazeretli" yoktur, 2026-10-30 owner).
 */
describe("lessonStatusBadge — web panel öncelik sırası", () => {
  it("cancelled her şeyden önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ status: "cancelled", lessonProcessed: true }))).toEqual({
      label: "İptal",
      tone: "neutral",
    });
  });

  it("telafi işareti işlendi'den önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ opsMakeupFlag: true, lessonProcessed: true }))).toEqual({
      label: "Telafi",
      tone: "warning",
    });
  });

  it("işlendi, geldi'den önce gelir ve KIRMIZI'dır (web: İŞLENDİ ≠ GELDİ)", () => {
    expect(lessonStatusBadge(baseLesson({ lessonProcessed: true, studentAttended: true }))).toEqual({
      label: "İşlendi",
      tone: "danger",
    });
  });

  it("geldi yeşildir", () => {
    expect(lessonStatusBadge(baseLesson({ studentAttended: true }))).toEqual({
      label: "Geldi",
      tone: "success",
    });
  });

  it("planlanan telafi dersi, yoklaması girilmedikçe sarı 'Planlanan telafi'dir", () => {
    expect(lessonStatusBadge(baseLesson({ type: "makeup" }))).toEqual({
      label: "Planlanan telafi",
      tone: "warning",
    });
  });

  it("gelecekteki ders nötr 'Planlandı'dır", () => {
    const future = baseLesson({ startAt: "2099-01-01T09:00:00.000Z", endAt: "2099-01-01T10:00:00.000Z" });
    expect(lessonStatusBadge(future)).toEqual({ label: "Planlandı", tone: "neutral" });
  });

  it("eski 'completed' değeri yalnız GEÇMİŞ derste Geldi üretir (web sözleşmesi)", () => {
    expect(lessonStatusBadge({ ...baseLesson(), status: "completed" })).toEqual({ label: "Geldi", tone: "success" });
    const futureCompleted = baseLesson({
      status: "completed",
      startAt: "2099-01-01T09:00:00.000Z",
      endAt: "2099-01-01T10:00:00.000Z",
    });
    expect(lessonStatusBadge(futureCompleted)).toEqual({ label: "Planlandı", tone: "neutral" });
  });

  it("geçmiş, işaretsiz ders 'Planlandı' görünür (web resolver davranışı)", () => {
    expect(lessonStatusBadge(baseLesson())).toEqual({ label: "Planlandı", tone: "neutral" });
  });
});

describe("legacy bayraklar görünür statü üretmez", () => {
  /**
   * "Mazeretli" diye bir yoklama statüsü YOK (2026-10-30 owner — web paneli
   * referans). `studentAbsent`/`studentExcused`/`status: "no_show"` web
   * `resolveLessonFinalStatus` OKUMAZ; çözüm zaman/toplantı kurallarına
   * düşer. Yalnız ledger (displayKey) bu bayrakları ayrı anahtarla taşır.
   */
  it("mazeretli bayrağı statü olarak görünmez (geçmiş işaretsiz → Planlandı)", () => {
    expect(lessonStatusBadge(baseLesson({ studentExcused: true }))).toEqual({
      label: "Planlandı",
      tone: "neutral",
    });
  });

  it("mazeretli bayraklı ders `completed` ise Geldi'dir", () => {
    expect(lessonStatusBadge({ ...baseLesson(), status: "completed", studentExcused: true })).toEqual({
      label: "Geldi",
      tone: "success",
    });
  });

  it("gelmedi bayrağı ve no_show statüsü görünür statü ÜRETMEZ (Planlandı)", () => {
    expect(lessonStatusBadge(baseLesson({ studentAbsent: true }))).toEqual({ label: "Planlandı", tone: "neutral" });
    expect(lessonStatusBadge({ ...baseLesson(), status: "no_show" })).toEqual({ label: "Planlandı", tone: "neutral" });
  });

  it("rozet etiketlerinde Mazeretli/İzinli ÜRETİLMEZ", () => {
    const lessons: Lesson[] = [
      baseLesson({ studentExcused: true }),
      baseLesson({ studentAbsent: true }),
      { ...baseLesson(), status: "no_show" },
      { ...baseLesson(), status: "completed" },
      baseLesson({ opsMakeupFlag: true }),
      baseLesson({ lessonProcessed: true }),
    ];
    for (const lesson of lessons) {
      expect(lessonStatusBadge(lesson).label).not.toMatch(/Mazeretli|İzinli/);
    }
  });
});

describe("studentFacingLessonStatus — aynı resolver", () => {
  it("diğer tüm statüler yönetici rozetiyle birebir aynı", () => {
    const cases: Array<Partial<Lesson>> = [
      { status: "cancelled" },
      { lessonProcessed: true },
      { studentAttended: true },
      { opsMakeupFlag: true },
      { studentExcused: true },
      { studentAbsent: true },
      { type: "makeup" },
      { startAt: "2099-01-01T09:00:00.000Z", endAt: "2099-01-01T10:00:00.000Z" },
    ];
    for (const c of cases) {
      expect(studentFacingLessonStatus(baseLesson(c))).toEqual(lessonStatusBadge(baseLesson(c)));
    }
  });

  it("öğrenci yüzeyinde 'Yoklama bekliyor' operasyon jargonu ÜRETİLMEZ", () => {
    expect(studentFacingLessonStatus(baseLesson()).label).not.toMatch(/yoklama/i);
  });
});
