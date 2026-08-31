import { describe, it, expect } from "vitest";
import { lessonStatusBadge } from "../lesson-status";
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

  it("geçmiş ve hiçbir bayrak yoksa yoklama bekliyor", () => {
    expect(lessonStatusBadge(baseLesson())).toEqual({ label: "Yoklama bekliyor", tone: "warning" });
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
