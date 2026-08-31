import { addDays, addMinutes, format, getDay, isAfter, parseISO, setHours, setMinutes, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import type { AppData, BranchId, Instrument, Lesson, LessonSeries, LessonSeriesStatus, StudentTermType } from "./types";
import { validateLessonSlot, type SlotValidationCode } from "./makeup-engine";
import { dayName, uid } from "./utils";

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return { h, m };
}

function formatHm(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type SeriesOccurrence = { startAt: string; endAt: string };

export type SeriesParams = {
  studentId: string;
  teacherId: string;
  roomId: string;
  branchId: BranchId;
  instrument: Instrument;
  /** 0=Pazar ... 6=Cumartesi */
  weekday: number;
  /** "HH:mm" */
  startTime: string;
  durationMinutes: number;
  startsOn: string;
  endsOn: string;
  /**
   * ÖNCELİK 4 (devam) — opsiyonel akademik dönem etiketi. Verilmezse legacy
   * (undefined) olarak kaydedilir — hiçbir mevcut çağrı sitesi bunu vermek
   * zorunda değil (geriye dönük uyumluluk).
   */
  term?: StudentTermType;
  academicYearStart?: number;
  /** Faz 6 — demo/test amaçlı otomatik üretim etiketi; verilmezse gerçek (undefined) seri. */
  demoTag?: string;
};

/**
 * `startsOn`..`endsOn` (dahil) arasında verilen haftanın gününe düşen tüm
 * tekil tarih/saatleri üretir. Saf fonksiyon — hiçbir doğrulama yapmaz,
 * yalnızca takvim aritmetiği.
 */
export function computeSeriesOccurrences(
  params: Pick<SeriesParams, "weekday" | "startTime" | "durationMinutes" | "startsOn" | "endsOn">
): SeriesOccurrence[] {
  const { h, m } = parseHm(params.startTime);
  const rangeStart = startOfDay(parseISO(params.startsOn));
  const rangeEnd = startOfDay(parseISO(params.endsOn));
  const occurrences: SeriesOccurrence[] = [];

  let cursor = rangeStart;
  let guard = 0;
  while (getDay(cursor) !== params.weekday && !isAfter(cursor, rangeEnd) && guard < 7) {
    cursor = addDays(cursor, 1);
    guard += 1;
  }

  while (!isAfter(cursor, rangeEnd)) {
    const start = setMinutes(setHours(cursor, h), m);
    const end = addMinutes(start, params.durationMinutes);
    occurrences.push({ startAt: start.toISOString(), endAt: end.toISOString() });
    cursor = addDays(cursor, 7);
  }
  return occurrences;
}

/** Ticket örneğiyle birebir: "Ece Yılmaz için her Salı 17:00–17:50 arasında, 1 Eylül 2026–30 Haziran 2027 döneminde 43 ders oluşturulacak." */
export function buildSeriesPreviewText(params: {
  studentName: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  startsOn: string;
  endsOn: string;
  occurrenceCount: number;
}): string {
  const { h, m } = parseHm(params.startTime);
  const endTime = formatHm(h * 60 + m + params.durationMinutes);
  const weekdayName = dayName(params.weekday);
  const startLabel = format(parseISO(params.startsOn), "d MMMM yyyy", { locale: tr });
  const endLabel = format(parseISO(params.endsOn), "d MMMM yyyy", { locale: tr });
  return (
    `${params.studentName} için her ${weekdayName} ${params.startTime}–${endTime} arasında, ` +
    `${startLabel}–${endLabel} döneminde ${params.occurrenceCount} ders oluşturulacak.`
  );
}

export type SeriesOccurrenceCheck =
  | { startAt: string; endAt: string; ok: true; availabilityOverridden?: boolean }
  | { startAt: string; endAt: string; ok: false; code: SlotValidationCode; message: string };

/**
 * Her oluşum için TEK doğrulama kaynağından (`validateLessonSlot`) geçer —
 * öğrenci/öğretmen/oda çakışması ve müsaitlik kuralları burada asla
 * kopyalanmaz veya yeniden yazılmaz.
 */
export function checkSeriesOccurrences(
  data: AppData,
  params: Pick<SeriesParams, "studentId" | "teacherId" | "roomId" | "instrument">,
  occurrences: SeriesOccurrence[],
  now: Date = new Date(),
  /** İş 1 — bkz. makeup-engine.ts allowAvailabilityOverride yorumu; yalnızca TEACHER_UNAVAILABLE'ı atlatır. */
  allowAvailabilityOverride = false
): SeriesOccurrenceCheck[] {
  return occurrences.map((occ) => {
    const result = validateLessonSlot(
      data,
      { instrument: params.instrument, studentId: params.studentId },
      { teacherId: params.teacherId, roomId: params.roomId, startAt: occ.startAt },
      { now, allowAvailabilityOverride }
    );
    if (result.ok) {
      return {
        startAt: result.slot.startAt,
        endAt: result.slot.endAt,
        ok: true,
        availabilityOverridden: result.slot.availabilityOverridden,
      };
    }
    return { startAt: occ.startAt, endAt: occ.endAt, ok: false, code: result.code, message: result.message };
  });
}

export type CreateSeriesResult =
  | {
      ok: true;
      data: AppData;
      seriesId: string;
      createdLessonIds: string[];
      skippedOccurrences: { startAt: string; code: SlotValidationCode; message: string }[];
    }
  | { ok: false; code: "BLOCKED_BY_CONFLICT" | "NO_VALID_OCCURRENCES"; message: string; conflicts: SeriesOccurrenceCheck[] }
  | { ok: false; code: "STUDENT_PAYMENT_PAUSED"; message: string; conflicts: [] };

/**
 * Saf veri dönüşümü: verilen AppData'ya yeni bir LessonSeries + ürettiği
 * Lesson kayıtlarını ekler. `options.skipConflicts` false (varsayılan) ise
 * TEK bir çakışma bile tüm seriyi engeller — hiçbir kayıt eklenmez.
 * true ise yalnızca çakışmayan oluşumlar eklenir, çakışanlar
 * `skippedOccurrences` içinde raporlanır.
 */
export function createLessonSeriesData(
  data: AppData,
  params: SeriesParams,
  options: {
    skipConflicts?: boolean;
    now?: Date;
    /** İş 1 — CSV toplu içe aktarımda kullanıcı onayı sonrası TEACHER_UNAVAILABLE'ı atlatır. */
    allowAvailabilityOverride?: boolean;
    overriddenByUserId?: string;
  } = {}
): CreateSeriesResult {
  const now = options.now ?? new Date();
  // Nilüfer Acar politikası §1E — ödeme nedeniyle duraklatılmış öğrenci için
  // yeni gelecek ders üretimi engellenir; mevcut ders/yoklama/ödeme kayıtları
  // bu kontrolden etkilenmez, yalnızca YENİ seri/ders oluşturma durur.
  const pausedStudent = data.students.find((s) => s.id === params.studentId);
  if (pausedStudent?.paymentPauseStatus === "paused") {
    return {
      ok: false,
      code: "STUDENT_PAYMENT_PAUSED",
      message: "Bu öğrencinin ders programı ödeme nedeniyle duraklatılmış; yeni ders serisi oluşturulamaz. Önce yeniden aktifleştirin.",
      conflicts: [],
    };
  }
  const occurrences = computeSeriesOccurrences(params);
  const checks = checkSeriesOccurrences(data, params, occurrences, now, options.allowAvailabilityOverride);
  const conflicts = checks.filter((c): c is Extract<SeriesOccurrenceCheck, { ok: false }> => !c.ok);

  if (conflicts.length > 0 && !options.skipConflicts) {
    return {
      ok: false,
      code: "BLOCKED_BY_CONFLICT",
      message: `${conflicts.length} derste çakışma var; hiçbir kayıt oluşturulmadı.`,
      conflicts: checks,
    };
  }

  const validChecks = checks.filter((c): c is Extract<SeriesOccurrenceCheck, { ok: true }> => c.ok);
  if (validChecks.length === 0) {
    return {
      ok: false,
      code: "NO_VALID_OCCURRENCES",
      message: "Seçilen dönemde uygun tek bir tarih bile yok.",
      conflicts: checks,
    };
  }

  const seriesId = uid("series");
  const nowIso = now.toISOString();
  const series: LessonSeries = {
    id: seriesId,
    studentId: params.studentId,
    teacherId: params.teacherId,
    roomId: params.roomId,
    branchId: params.branchId,
    instrument: params.instrument,
    weekday: params.weekday,
    startTime: params.startTime,
    durationMinutes: params.durationMinutes,
    startsOn: params.startsOn,
    endsOn: params.endsOn,
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    term: params.term,
    academicYearStart: params.academicYearStart,
    demoTag: params.demoTag,
  };

  const newLessons: Lesson[] = validChecks.map((c) => ({
    id: uid("les"),
    studentId: params.studentId,
    teacherId: params.teacherId,
    roomId: params.roomId,
    branchId: params.branchId,
    instrument: params.instrument,
    startAt: c.startAt,
    endAt: c.endAt,
    type: "regular",
    status: "scheduled",
    seriesId,
    // Seriden üretilen ders serinin dönem etiketini miras alır.
    term: params.term,
    academicYearStart: params.academicYearStart,
    availabilityOverride:
      c.availabilityOverridden && options.overriddenByUserId
        ? { by: options.overriddenByUserId, at: nowIso }
        : undefined,
  }));

  const nextData: AppData = {
    ...data,
    lessons: [...data.lessons, ...newLessons],
    lessonSeries: [...data.lessonSeries, series],
  };

  return {
    ok: true,
    data: nextData,
    seriesId,
    createdLessonIds: newLessons.map((l) => l.id),
    skippedOccurrences: conflicts.map((c) => ({ startAt: c.startAt, code: c.code, message: c.message })),
  };
}

export type SeriesCancelResult =
  | { ok: true; data: AppData; cancelledLessonIds: string[] }
  | { ok: false; code: "LESSON_NOT_FOUND" | "SERIES_NOT_FOUND"; message: string };

/**
 * "Bu ders ve sonrası": bu dersten (dahil) itibaren serinin gelecekteki
 * tüm dersleri iptal edilir; seri bu tarihte "ended" olarak kapatılır.
 * Geçmiş dersler, yoklama ve ödeme ilişkileri hiç dokunulmadan kalır.
 */
export function cancelSeriesFromLesson(
  data: AppData,
  lessonId: string,
  now: Date = new Date()
): SeriesCancelResult {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };
  if (!lesson.seriesId) return { ok: false, code: "LESSON_NOT_FOUND", message: "Bu ders bir seriye ait değil." };
  const series = data.lessonSeries.find((s) => s.id === lesson.seriesId);
  if (!series) return { ok: false, code: "SERIES_NOT_FOUND", message: "Seri bulunamadı." };

  const cutoff = parseISO(lesson.startAt);
  const cancelledLessonIds: string[] = [];
  const lessons = data.lessons.map((l) => {
    if (l.seriesId !== series.id) return l;
    if (parseISO(l.startAt) < cutoff) return l;
    if (l.status !== "scheduled") return l;
    cancelledLessonIds.push(l.id);
    return { ...l, status: "cancelled" as const };
  });

  const dayBeforeCutoff = addDays(startOfDay(cutoff), -1).toISOString();
  const lessonSeries = data.lessonSeries.map((s) =>
    s.id === series.id
      ? { ...s, status: "ended" as LessonSeriesStatus, endsOn: dayBeforeCutoff, updatedAt: now.toISOString() }
      : s
  );

  return { ok: true, data: { ...data, lessons, lessonSeries }, cancelledLessonIds };
}

/**
 * "Tüm seri": geçmiş dersler (ve onların yoklama/ödeme ilişkileri) korunur;
 * şu andan sonraki tüm planlı dersler iptal edilir, seri "cancelled" olur.
 * Fiziksel silme yapılmaz.
 */
export function cancelEntireSeries(
  data: AppData,
  seriesId: string,
  now: Date = new Date()
): SeriesCancelResult {
  const series = data.lessonSeries.find((s) => s.id === seriesId);
  if (!series) return { ok: false, code: "SERIES_NOT_FOUND", message: "Seri bulunamadı." };

  const cancelledLessonIds: string[] = [];
  const lessons = data.lessons.map((l) => {
    if (l.seriesId !== seriesId) return l;
    if (parseISO(l.startAt) <= now) return l;
    if (l.status !== "scheduled") return l;
    cancelledLessonIds.push(l.id);
    return { ...l, status: "cancelled" as const };
  });

  const lessonSeries = data.lessonSeries.map((s) =>
    s.id === seriesId ? { ...s, status: "cancelled" as LessonSeriesStatus, updatedAt: now.toISOString() } : s
  );

  return { ok: true, data: { ...data, lessons, lessonSeries }, cancelledLessonIds };
}
