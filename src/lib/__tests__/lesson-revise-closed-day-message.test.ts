/**
 * 2026-10-25 — Gökhan hoca Salı serisi vakası: "Bu ders ve sonrası" 20:00
 * revizyonu, serideki TEK bir zorla-kapalı Salı yüzünden atomik olarak
 * engelleniyordu; ama mesaj ("İlk sorun: Yönetici bu günü kapattı (zorla
 * kapalı).") HANGİ tarihin engellediğini, hedef saati ve ne yapılacağını
 * söylemiyordu. Bu test mesajın engellenen tarih + hedef saat + kapatma
 * kapsamı + neden + düzeltme yolunu içerdiğini ve hiçbir dersin değişmediğini
 * kilitler. Blok davranışı (atomik, kısmi değişiklik yok) BİLİNÇLİ korunur.
 */
import { describe, expect, it } from "vitest";
import { createSeedData } from "../seed";
import { applyLessonRevision } from "../lesson-scope-edit";
import { zonedWallTimeToUtc } from "../timezone";
import type { AppData, ClosedDay, Lesson } from "../types";

const SERIES = "ser_revise_closed_day_msg";

/** 3 Salı dersli seri (19:00, 30 dk); ortadaki Salı zorla kapalı. 2027-06'da dinî/sabit tatil yok. */
function seriesData(): { data: AppData; lessons: Lesson[] } {
  const base = createSeedData();
  const tpl = base.lessons.find((l) => l.type !== "makeup")!;
  const mk = (id: string, ymd: string): Lesson => {
    const start = zonedWallTimeToUtc(ymd, "19:00");
    return {
      ...tpl,
      id,
      seriesId: SERIES,
      type: "regular",
      status: "scheduled",
      makeupRequestId: undefined,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
      studentAttended: false,
      lessonProcessed: false,
      opsMakeupFlag: false,
      studentAbsent: false,
      studentExcused: false,
    };
  };
  const lessons = ["2027-06-01", "2027-06-08", "2027-06-15"].map((ymd, i) => mk(`les_rcd_${i}`, ymd));
  const forcedClosed: ClosedDay = {
    id: "cld_test",
    date: "2027-06-08",
    name: "Kurum içi eğitim",
    kind: "custom",
    isOpen: false,
    createdBy: "u1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const data: AppData = {
    ...base,
    lessons: [...base.lessons.filter((l) => l.studentId !== tpl.studentId && l.teacherId !== tpl.teacherId), ...lessons],
    closedDayOverrides: [forcedClosed],
    settings: { ...base.settings, termWeeklyClosedDays: undefined },
  };
  return { data, lessons };
}

describe("seri revize kapalı gün engeli — kullanılabilir mesaj", () => {
  it("zorla kapalı Salı: engellenen tarih, hedef saat, kapsam, neden ve çözüm söylenir; hiçbir ders değişmez", () => {
    const { data, lessons } = seriesData();
    const before = lessons.map((l) => l.startAt);
    const r = applyLessonRevision(data, {
      lessonId: lessons[0]!.id,
      scope: "fromHereOnward",
      startTime: "20:00",
      weekday: 2,
      durationMinutes: 30,
      allowAvailabilityOverride: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("BLOCKED_BY_CONFLICT");
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts![0]!.code).toBe("CLOSED_DAY");
    // Etkilenen ders sayısı + atomiklik ifadesi korunur.
    expect(r.message).toContain("1 derste çakışma var");
    expect(r.message).toContain("hiçbir ders değiştirilmedi");
    // Engellenen tarih + hedef saat.
    expect(r.message).toContain("08.06.2027");
    expect(r.message).toContain("Salı");
    expect(r.message).toContain("20:00");
    // Kapatma kapsamı + nedeni + düzeltme yolu.
    expect(r.message).toContain("zorla kapalı");
    expect(r.message).toContain("Kurum içi eğitim");
    expect(r.message).toContain("kurum geneli");
    expect(r.message).toContain("Çalışma Günleri");
    // Atomik: girdi verisindeki seri dersleri değişmedi.
    expect(data.lessons.filter((l) => l.seriesId === SERIES).map((l) => l.startAt)).toEqual(before);
  });

  it("öğretmen çakışması (saat takasının ikinci engeli) hangi tarihi engellediğini söyler", () => {
    const { data, lessons } = seriesData();
    const tpl = lessons[0]!;
    // 15.06.2027 20:00'de aynı öğretmenin başka öğrenciye dersi var.
    const otherStudent = data.students.find((s) => s.id !== tpl.studentId)!;
    const blockerStart = zonedWallTimeToUtc("2027-06-15", "20:00");
    const blocker: Lesson = {
      ...tpl,
      id: "les_rcd_blocker",
      seriesId: undefined,
      studentId: otherStudent.id,
      startAt: blockerStart.toISOString(),
      endAt: new Date(blockerStart.getTime() + 30 * 60_000).toISOString(),
    };
    const r = applyLessonRevision(
      { ...data, lessons: [...data.lessons, blocker] },
      {
        lessonId: lessons[0]!.id,
        scope: "fromHereOnward",
        startTime: "20:00",
        weekday: 2,
        durationMinutes: 30,
        allowAvailabilityOverride: true,
      }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("BLOCKED_BY_CONFLICT");
    expect(r.conflicts).toHaveLength(2);
    const second = r.conflicts!.find((c) => c.startAt.startsWith("2027-06-15"));
    expect(second).toBeDefined();
    expect(second!.message).toContain("15.06.2027");
    expect(second!.message).toContain("20:00");
  });
});
