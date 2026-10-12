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

describe("lessonStatusBadge — öncelik sırası", () => {
  it("cancelled her şeyden önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ status: "cancelled", lessonProcessed: true }))).toEqual({
      label: "İptal edildi",
      tone: "neutral",
    });
  });

  it("işlendi, katıldı'dan önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ lessonProcessed: true, studentAttended: true }))).toEqual({
      label: "İşlendi",
      tone: "success",
    });
  });

  it("katıldı, telafi bayrağından önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ studentAttended: true, opsMakeupFlag: true }))).toEqual({
      label: "Katıldı",
      tone: "success",
    });
  });

  it("telafi bayrağı, gelmedi'den önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ opsMakeupFlag: true, studentAbsent: true }))).toEqual({
      label: "Telafi bekliyor",
      tone: "warning",
    });
  });

  it("gelmedi, izinli'den önce gelir", () => {
    expect(lessonStatusBadge(baseLesson({ studentAbsent: true, studentExcused: true }))).toEqual({
      label: "Gelmedi",
      tone: "danger",
    });
  });

  it("izinli", () => {
    expect(lessonStatusBadge(baseLesson({ studentExcused: true }))).toEqual({ label: "İzinli", tone: "info" });
  });

  it("geçmiş ve hiçbir bayrak yoksa nötr 'Henüz sonuçlanmadı'", () => {
    expect(lessonStatusBadge(baseLesson())).toEqual({ label: "Henüz sonuçlanmadı", tone: "neutral" });
  });

  it("gelecekteki ders planlandı olarak işaretlenir", () => {
    const future = baseLesson({ startAt: "2099-01-01T09:00:00.000Z", endAt: "2099-01-01T10:00:00.000Z" });
    expect(lessonStatusBadge(future)).toEqual({ label: "Planlandı", tone: "primary" });
  });

  it("in_progress, gelecekteki 'planlandı' varsayılanının önüne geçer", () => {
    const future = baseLesson({ status: "in_progress", startAt: "2099-01-01T09:00:00.000Z", endAt: "2099-01-01T10:00:00.000Z" });
    expect(lessonStatusBadge(future)).toEqual({ label: "Devam ediyor", tone: "info" });
  });
});

describe("studentFacingLessonStatus — öğrenci portalında yoklama dili yok", () => {
  it("sonuçlanmamış ders nötr 'Henüz sonuçlanmadı' olur", () => {
    expect(studentFacingLessonStatus(baseLesson())).toEqual({ label: "Henüz sonuçlanmadı", tone: "neutral" });
  });

  it("diğer tüm statüler aynen geçer", () => {
    const cases: Array<Partial<Lesson>> = [
      { status: "cancelled" },
      { lessonProcessed: true },
      { studentAttended: true },
      { opsMakeupFlag: true },
      { studentExcused: true },
      { startAt: "2099-01-01T09:00:00.000Z", endAt: "2099-01-01T10:00:00.000Z" },
    ];
    for (const c of cases) {
      expect(studentFacingLessonStatus(baseLesson(c))).toEqual(lessonStatusBadge(baseLesson(c)));
    }
  });

  it("öğrenci yüzeyinde 'Yoklama bekliyor' metni üretilmez", () => {
    expect(studentFacingLessonStatus(baseLesson()).label).not.toMatch(/yoklama/i);
  });
});
