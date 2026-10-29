/**
 * 2026-09-30 — serinin ilk dersi yoklama geri alındıktan sonra "yoklama kaydı var"
 * diye revize edilemiyordu. Kök neden: geri alma yalnız "Geldi"nin kendi "present"
 * satırını siliyordu; statü değiştirilerek (Geldi → Gelmedi) ya da Telafi ile
 * girilip geri alınan derste `Attendance` satırı kalıyor ve revizyonu kilitliyordu.
 */
import { describe, it, expect } from "vitest";
import { createSeedData } from "../seed";
import { clearLessonOpsFlag, switchLessonOpsFlag, type LessonOpsFlag } from "../lesson-ops";
import { applyLessonRevision, lessonProtectionReason } from "../lesson-scope-edit";
import type { AppData, Lesson } from "../types";

const SERIES = "ser_revise_test";

/** Seed verisine 2 dersli bir seri ekler (ilk ders + sonraki ders), seed derslerinden uzak bir haftada. */
function seriesData(): { data: AppData; first: Lesson; second: Lesson } {
  const base = createSeedData();
  const tpl = base.lessons.find((l) => l.type !== "makeup")!;
  const mk = (id: string, days: number): Lesson => {
    const start = new Date(Date.now() + days * 86_400_000);
    start.setUTCHours(11, 0, 0, 0);
    return {
      ...tpl,
      id,
      seriesId: SERIES,
      type: "regular",
      status: "scheduled",
      makeupRequestId: undefined,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
      studentAttended: false,
      lessonProcessed: false,
      opsMakeupFlag: false,
      studentAbsent: false,
      studentExcused: false,
    };
  };
  const first = mk("les_first", 60);
  const second = mk("les_second", 67);
  const data: AppData = {
    ...base,
    lessons: [...base.lessons.filter((l) => l.studentId !== tpl.studentId && l.teacherId !== tpl.teacherId), first, second],
    closedDayOverrides: [],
    settings: { ...base.settings, termWeeklyClosedDays: undefined },
  };
  return { data, first, second };
}

function mark(data: AppData, lessonId: string, flag: LessonOpsFlag): AppData {
  const r = switchLessonOpsFlag(data, lessonId, flag, "u1", new Date(), "test gerekçesi");
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

function undo(data: AppData, lessonId: string, expected: LessonOpsFlag): AppData {
  const r = clearLessonOpsFlag(data, lessonId, expected, "u1");
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

function reviseOneHourLater(data: AppData, lesson: Lesson) {
  const ymdHm = new Date(new Date(lesson.startAt).getTime() + 60 * 60_000);
  // Kurum saati (Europe/Istanbul, UTC+3) duvar saati girişi.
  const wall = new Date(ymdHm.getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
  return applyLessonRevision(data, { lessonId: lesson.id, scope: "single", startAt: wall, allowAvailabilityOverride: true });
}

describe("yoklama gir → geri al → revize (seri ilk ders + sonraki ders)", () => {
  it("Geldi → Gelmedi → geri al: ilk ders revize edilir, sonraki ders değişmez", () => {
    const { data: d0, first, second } = seriesData();
    let d = mark(d0, first.id, "attended");
    d = mark(d, first.id, "absent");
    d = undo(d, first.id, "absent");
    expect(d.attendances.filter((a) => a.lessonId === first.id)).toHaveLength(0);
    expect(lessonProtectionReason(d, d.lessons.find((l) => l.id === first.id)!)).toBeNull();

    const r = reviseOneHourLater(d, first);
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
    if (!r.ok) return;
    expect(r.updatedLessons.map((l) => l.id)).toEqual([first.id]);
    expect(r.data.lessons.find((l) => l.id === second.id)!.startAt).toBe(second.startAt);
  });

  it("Telafi → geri al: iptal edilen talebin yoklama çapası revizyonu kilitlemez", () => {
    const { data: d0, first } = seriesData();
    let d = mark(d0, first.id, "makeup");
    d = undo(d, first.id, "makeup");
    // İptal edilmiş talep geçmiş kaydı olarak korunur (FK çapası), silinmez.
    expect(d.makeupRequests.some((m) => m.sourceLessonId === first.id && m.status === "cancelled")).toBe(true);
    const r = reviseOneHourLater(d, first);
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
  });

  it("sonraki ders: Geldi → geri al → revize edilir", () => {
    const { data: d0, second } = seriesData();
    const d = undo(mark(d0, second.id, "attended"), second.id, "attended");
    expect(reviseOneHourLater(d, second).ok).toBe(true);
  });
});

describe("gerçek bağı olan ders hâlâ korunur ve bağ adıyla söylenir", () => {
  it("Geldi işaretli ders revize edilmez; mesaj statüyü ve çözümü söyler", () => {
    const { data: d0, first } = seriesData();
    const r = reviseOneHourLater(mark(d0, first.id, "attended"), first);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("Geldi");
    expect(r.message).toMatch(/geri al/i);
  });

  it("Yoklama ekranından girilmiş kayıt revizyonu engeller; mesaj kaydın türünü söyler", () => {
    const { data: d0, first } = seriesData();
    const d: AppData = {
      ...d0,
      attendances: [
        ...d0.attendances,
        { id: "att_legacy", lessonId: first.id, studentId: first.studentId, status: "late", markedAt: new Date().toISOString(), createsMakeupCredit: false },
      ],
    };
    const r = reviseOneHourLater(d, first);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("Geç kaldı");
    expect(r.message).not.toMatch(/: yoklama kaydı var\.$/);
  });

  it("Telafi işaretli (bekleyen talep) ders korunur", () => {
    const { data: d0, first } = seriesData();
    const r = reviseOneHourLater(mark(d0, first.id, "makeup"), first);
    expect(r.ok).toBe(false);
  });

  it("derse bağlı tahsilat varsa korunur", () => {
    const { data: d0, first } = seriesData();
    const pay = { ...d0.payments[0]!, id: "pay_lesson", lessonId: first.id, status: "paid" as const };
    const r = reviseOneHourLater({ ...d0, payments: [...d0.payments, pay] }, first);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("tahsilat");
  });
});
