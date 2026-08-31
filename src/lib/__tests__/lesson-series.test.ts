import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseISO } from "date-fns";
import { createSeedData } from "../seed";
import {
  computeSeriesOccurrences,
  buildSeriesPreviewText,
  checkSeriesOccurrences,
  createLessonSeriesData,
  cancelSeriesFromLesson,
  cancelEntireSeries,
  type SeriesParams,
} from "../lesson-series";
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

describe("computeSeriesOccurrences", () => {
  it("dönem boyunca haftalık doğru ders sayısını üretir (5 Salı)", () => {
    const occurrences = computeSeriesOccurrences({
      weekday: 2,
      startTime: "17:00",
      durationMinutes: 45,
      startsOn: "2026-09-01",
      endsOn: "2026-09-29",
    });
    expect(occurrences).toHaveLength(5);
    for (const occ of occurrences) {
      expect(new Date(occ.startAt).getDay()).toBe(2);
      const durationMs = new Date(occ.endAt).getTime() - new Date(occ.startAt).getTime();
      expect(durationMs).toBe(45 * 60 * 1000);
    }
  });

  it("başlangıç tarihi hedef haftanın gününden önceyse ilk uygun güne ilerler", () => {
    // 2026-09-01 Salı; startsOn'u Pazar (30 Ağustos 2026) veriyoruz.
    const occurrences = computeSeriesOccurrences({
      weekday: 2,
      startTime: "10:00",
      durationMinutes: 30,
      startsOn: "2026-08-30",
      endsOn: "2026-09-08",
    });
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].startAt.startsWith("2026-09-01")).toBe(true);
  });
});

describe("buildSeriesPreviewText", () => {
  it("beklenen Türkçe önizleme cümlesini üretir", () => {
    const text = buildSeriesPreviewText({
      studentName: "Ece Yılmaz",
      weekday: 2,
      startTime: "17:00",
      durationMinutes: 50,
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
      occurrenceCount: 43,
    });
    expect(text).toContain("Ece Yılmaz için her Salı 17:00–17:50 arasında");
    expect(text).toContain("43 ders oluşturulacak");
  });
});

describe("checkSeriesOccurrences", () => {
  it("öğretmen çakışmasını ayrı yakalar", () => {
    // Fake timer aktifken üretilmesi gerekir (seed tarihleri "now"a görelidir).
    const data = createSeedData();
    // t1 (Nilüfer) zaten l12'de dolu — o slotu tekrar isteyelim.
    const l12 = data.lessons.find((l) => l.id === "l12")!;
    const params: Pick<SeriesParams, "studentId" | "teacherId" | "roomId" | "instrument"> = {
      studentId: "s5",
      teacherId: "t1",
      roomId: "r1",
      instrument: "Şan",
    };
    const checks = checkSeriesOccurrences(data, params, [{ startAt: l12.startAt, endAt: l12.endAt }], FIXED_NOW);
    expect(checks[0].ok).toBe(false);
    if (!checks[0].ok) expect(["TEACHER_CONFLICT", "ROOM_CONFLICT"]).toContain(checks[0].code);
  });

  it("öğrenci çakışmasını öğretmen/oda çakışmasından ayrı yakalar", () => {
    const data = createSeedData();
    // l12: s1,t1,r1,Piyano. Aynı öğrenci (s1) aynı saatte, FARKLI öğretmen
    // (t2) ve FARKLI oda (r2) ile talep edilirse yalnızca STUDENT_CONFLICT
    // tetiklenmeli — öğretmen/oda tarafında hiçbir çakışma yok.
    const l12 = data.lessons.find((l) => l.id === "l12")!;
    const params: Pick<SeriesParams, "studentId" | "teacherId" | "roomId" | "instrument"> = {
      studentId: "s1",
      teacherId: "t2",
      roomId: "r2",
      instrument: "Gitar",
    };
    const checks = checkSeriesOccurrences(data, params, [{ startAt: l12.startAt, endAt: l12.endAt }], FIXED_NOW);
    expect(checks[0].ok).toBe(false);
    if (!checks[0].ok) expect(checks[0].code).toBe("STUDENT_CONFLICT");
  });

  it("çakışmasız bir seri için tüm oluşumları geçerli sayar", () => {
    const data = createSeedData();
    const occurrences = computeSeriesOccurrences({
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 45,
      startsOn: "2026-09-01",
      endsOn: "2026-09-15",
    });
    const checks = checkSeriesOccurrences(
      data,
      { studentId: "s1", teacherId: "t1", roomId: "r1", instrument: "Piyano" },
      occurrences,
      FIXED_NOW
    );
    expect(checks.every((c) => c.ok)).toBe(true);
  });
});

describe("createLessonSeriesData", () => {
  const baseParams: SeriesParams = {
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    weekday: 2,
    startTime: "11:00",
    durationMinutes: 45,
    startsOn: "2026-09-01",
    endsOn: "2026-09-15",
  };

  it("çakışma yoksa tüm dersleri tek işlemde oluşturur", () => {
    const data = createSeedData();
    const result = createLessonSeriesData(data, baseParams, { now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdLessonIds).toHaveLength(3);
    expect(result.data.lessonSeries).toHaveLength(1);
    expect(result.data.lessonSeries[0].status).toBe("active");
    for (const id of result.createdLessonIds) {
      const lesson = result.data.lessons.find((l) => l.id === id);
      expect(lesson?.seriesId).toBe(result.seriesId);
    }
  });

  it("varsayılan davranışta TEK çakışma bile tüm seriyi engeller — hiçbir kayıt yazılmaz", () => {
    const data = createSeedData();
    // l14: s5,t1,r1,Şan — 2 gün sonra 15:00. Aynı öğretmen/oda ile çakışan bir seri kur.
    const l14 = data.lessons.find((l) => l.id === "l14")!;
    const conflictingParams: SeriesParams = {
      ...baseParams,
      studentId: "s3",
      teacherId: l14.teacherId,
      roomId: l14.roomId,
      weekday: new Date(l14.startAt).getDay(),
      startTime: `${new Date(l14.startAt).getHours()}:00`,
      startsOn: l14.startAt.slice(0, 10),
      endsOn: l14.startAt.slice(0, 10),
    };
    const before = data.lessons.length;
    const result = createLessonSeriesData(data, conflictingParams, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BLOCKED_BY_CONFLICT");
    expect(data.lessons.length).toBe(before); // girdi verisi mutasyona uğramadı
  });

  it("skipConflicts açıkken yalnızca çakışmayan oluşumları oluşturur ve atlananları raporlar", () => {
    const data = createSeedData();
    const l14 = data.lessons.find((l) => l.id === "l14")!;
    const conflictDate = l14.startAt.slice(0, 10);
    const weekday = new Date(l14.startAt).getDay();

    // 3 haftalık bir seri kur; ortadaki hafta l14 ile çakışsın.
    const params: SeriesParams = {
      ...baseParams,
      studentId: "s3",
      teacherId: l14.teacherId,
      roomId: l14.roomId,
      weekday,
      startTime: `${new Date(l14.startAt).getHours()}:00`,
      startsOn: new Date(new Date(conflictDate).getTime() - 7 * 86400000).toISOString().slice(0, 10),
      endsOn: new Date(new Date(conflictDate).getTime() + 7 * 86400000).toISOString().slice(0, 10),
    };
    const result = createLessonSeriesData(data, params, { now: FIXED_NOW, skipConflicts: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdLessonIds.length).toBeGreaterThan(0);
    expect(result.skippedOccurrences.length).toBeGreaterThan(0);
    expect(result.skippedOccurrences.some((s) => s.startAt.startsWith(conflictDate))).toBe(true);
  });

  it("ödeme nedeniyle duraklatılmış öğrenci için yeni seri oluşturmayı engeller", () => {
    const data = createSeedData();
    const student = data.students.find((s) => s.id === baseParams.studentId)!;
    student.paymentPauseStatus = "paused";
    const before = data.lessons.length;
    const result = createLessonSeriesData(data, baseParams, { now: FIXED_NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STUDENT_PAYMENT_PAUSED");
    expect(data.lessons.length).toBe(before);
  });
});

describe("cancelSeriesFromLesson", () => {
  it("geçmiş dersleri korur; bu ders ve sonrasını iptal eder, seriyi 'ended' yapar", () => {
    const data = createSeedData();
    const params: SeriesParams = {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 45,
      startsOn: "2026-09-01",
      endsOn: "2026-09-22",
    };
    const created = createLessonSeriesData(data, params, { now: FIXED_NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const lessonIds = created.createdLessonIds;
    expect(lessonIds.length).toBe(4);
    const secondLessonId = lessonIds[1];

    const result = cancelSeriesFromLesson(created.data, secondLessonId, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const first = result.data.lessons.find((l) => l.id === lessonIds[0])!;
    const second = result.data.lessons.find((l) => l.id === lessonIds[1])!;
    const third = result.data.lessons.find((l) => l.id === lessonIds[2])!;
    expect(first.status).toBe("scheduled"); // önceki ders dokunulmadı
    expect(second.status).toBe("cancelled");
    expect(third.status).toBe("cancelled");

    const series = result.data.lessonSeries.find((s) => s.id === created.seriesId)!;
    expect(series.status).toBe("ended");
  });
});

describe("cancelEntireSeries", () => {
  it("geçmiş dersler korunur; gelecekteki tüm dersler iptal edilir, seri 'cancelled' olur", () => {
    const data = createSeedData();
    const params: SeriesParams = {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 45,
      startsOn: "2026-09-01",
      endsOn: "2026-09-22",
    };
    const created = createLessonSeriesData(data, params, { now: FIXED_NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = cancelEntireSeries(created.data, created.seriesId, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const id of created.createdLessonIds) {
      const lesson = result.data.lessons.find((l) => l.id === id)!;
      // Tüm oluşumlar FIXED_NOW'dan sonra (gelecekte) olduğu için hepsi iptal olmalı.
      expect(parseISO(lesson.startAt).getTime()).toBeGreaterThan(FIXED_NOW.getTime());
      expect(lesson.status).toBe("cancelled");
    }
    const series = result.data.lessonSeries.find((s) => s.id === created.seriesId)!;
    expect(series.status).toBe("cancelled");
  });

  it("zaten tamamlanmış/iptal edilmiş dersleri tekrar durum değiştirmez", () => {
    const data = createSeedData();
    const params: SeriesParams = {
      studentId: "s1",
      teacherId: "t1",
      roomId: "r1",
      branchId: "erzene",
      instrument: "Piyano",
      weekday: 2,
      startTime: "11:00",
      durationMinutes: 45,
      startsOn: "2026-09-01",
      endsOn: "2026-09-01",
    };
    const created = createLessonSeriesData(data, params, { now: FIXED_NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const completedLesson: Lesson = {
      ...created.data.lessons.find((l) => l.id === created.createdLessonIds[0])!,
      status: "completed",
    };
    const dataWithCompleted = {
      ...created.data,
      lessons: created.data.lessons.map((l) => (l.id === completedLesson.id ? completedLesson : l)),
    };

    const result = cancelEntireSeries(dataWithCompleted, created.seriesId, FIXED_NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const untouched = result.data.lessons.find((l) => l.id === completedLesson.id)!;
    expect(untouched.status).toBe("completed");
  });
});
