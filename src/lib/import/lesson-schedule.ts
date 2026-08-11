/**
 * İş 1 — Ders Programı CSV importuna tekrarlayan (haftalık) seri desteği.
 * `lessons.ts`'teki (tekil ders) mevcut sütun adları ve davranışı AYNEN
 * korunur — bu modül onun ÜSTÜNE, geriye dönük uyumlu bir katman ekler:
 * eski CSV'ler (yalnız `tarih`/`saat`/`sure_dk`, `tekrar_tipi` sütunu hiç
 * yoksa) burada da birebir aynı sonucu üretir (tekil ders, tekrar yok).
 *
 * Doğrulama TEK kaynaktan geçer: tekil dersler `validateLessonSlot`,
 * seriler `checkSeriesOccurrences` (o da içeride aynı `validateLessonSlot`'u
 * çağırır) — ikinci bir paralel çakışma/uygunluk kuralı YOK.
 *
 * Müsaitlik dışı (TEACHER_UNAVAILABLE) satırlar/oluşumlar HARD error değil,
 * ayrı bir `warnings` listesine düşer — commit yalnızca kullanıcı açıkça
 * `allowAvailabilityOverride: true` verirse bu satırları da oluşturur (bkz.
 * commitLessonScheduleImportTool). Gerçek çakışma (TEACHER_CONFLICT,
 * ROOM_CONFLICT, STUDENT_CONFLICT) ve geçersiz referanslar HER ZAMAN hard
 * error'dur — override bunları asla atlatmaz (bkz. makeup-engine.ts
 * OVERRIDABLE_SLOT_CODES).
 */
import type { AppData, Instrument, StudentTermType } from "../types";
import { INSTRUMENTS } from "../types";
import type { CsvRecord } from "./csv";
import type { ImportRowError, ImportReadRow } from "./types";
import { IMPORT_READ_ROWS_PREVIEW_LIMIT } from "./types";
import { resolveBranchId, resolveTeacherIdByName, resolveStudentIdByName } from "./branch-lookup";
import { resolveCanonicalValue } from "../normalize";
import { validateLessonSlot } from "../makeup-engine";
import { computeSeriesOccurrences, checkSeriesOccurrences, type SeriesParams } from "../lesson-series";
import { LESSON_DURATION_OPTIONS } from "../lesson-duration";

export const LESSON_SCHEDULE_CSV_COLUMNS = [
  "ogrenci",
  "ogretmen",
  "sube",
  "enstruman",
  "oda",
  "baslangic_tarihi",
  "bitis_tarihi",
  "baslangic_saati",
  "ders_suresi_dk",
  "tekrar_tipi",
  "tekrar_gunleri",
  "tekrar_araligi",
  "toplam_tekrar",
  "notlar",
] as const;

export const LESSON_SCHEDULE_CSV_SAMPLE = `ogrenci,ogretmen,sube,enstruman,oda,baslangic_tarihi,bitis_tarihi,baslangic_saati,ders_suresi_dk,tekrar_tipi,tekrar_gunleri,tekrar_araligi,toplam_tekrar,notlar
Zeynep Yıldız,Nilüfer Acar,Erzene,Piyano,Stüdyo 1 — Piyano,2026-09-07,,14:00,40,once,,,,
Ece Yılmaz,Nilüfer Acar,Erzene,Keman,Stüdyo 3 — Flüt/Keman,2026-09-01,2027-06-30,17:00,40,weekly,Salı,1,,
Kerem Doğan,Nilüfer Acar,Erzene,Gitar,Stüdyo 2 — Gitar,2026-09-01,2027-06-30,16:00,30,weekly,Pazartesi|Çarşamba,1,,İki gün üst üste
`;

/**
 * `tekrar_gunleri` dokümante edilmiş açık format: Türkçe gün adı
 * ("Pazartesi") VEYA 0=Pazar..6=Cumartesi sayısı — birden fazla gün `|` ile
 * ayrılır (ör. "Pazartesi|Çarşamba"). Bilinmeyen bir değer hard error'dur,
 * asla tahmin edilmez.
 */
const WEEKDAY_NAMES: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  sali: 2,
  "salı": 2,
  carsamba: 3,
  "çarşamba": 3,
  persembe: 4,
  "perşembe": 4,
  cuma: 5,
  cumartesi: 6,
};

function parseWeekday(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  if (/^[0-6]$/.test(t)) return Number(t);
  const key = t.toLocaleLowerCase("tr");
  return key in WEEKDAY_NAMES ? WEEKDAY_NAMES[key]! : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isInstrument(value: string): value is Instrument {
  return (INSTRUMENTS as string[]).includes(value);
}

function resolveRoomId(
  data: AppData,
  branchId: string,
  roomName: string
): { ok: true; roomId: string } | { ok: false; message: string } {
  const key = roomName.trim().toLocaleLowerCase("tr");
  const matches = data.rooms.filter(
    (r) => r.branchId === branchId && r.name.trim().toLocaleLowerCase("tr") === key && r.active !== false
  );
  if (matches.length === 0) {
    return { ok: false, message: `"${roomName}" adında (bu şubede) aktif bir oda bulunamadı.` };
  }
  return { ok: true, roomId: matches[0]!.id };
}

function findExactDuplicateLesson(
  lessons: AppData["lessons"],
  teacherId: string,
  roomId: string,
  startAtIso: string
): boolean {
  return lessons.some(
    (l) => l.teacherId === teacherId && l.roomId === roomId && l.startAt === startAtIso && l.status !== "cancelled"
  );
}

/**
 * Aynı öğrenci+öğretmen+oda+haftagünü+saat+dönem ile ZATEN var olan AKTİF
 * bir seri mi? Varsa satır "duplicate" sayılır — aynı CSV'nin tekrar
 * yüklenmesi kör duplicate seri üretmez (tekil derslerdeki
 * findExactDuplicateLesson ile aynı ilke).
 */
function findExactDuplicateSeries(
  series: AppData["lessonSeries"],
  params: Pick<SeriesParams, "studentId" | "teacherId" | "roomId" | "weekday" | "startTime" | "startsOn" | "endsOn">
): boolean {
  return series.some(
    (s) =>
      s.status === "active" &&
      s.studentId === params.studentId &&
      s.teacherId === params.teacherId &&
      s.roomId === params.roomId &&
      s.weekday === params.weekday &&
      s.startTime === params.startTime &&
      s.startsOn === params.startsOn &&
      s.endsOn === params.endsOn
  );
}

export type SingleLessonPlan = {
  kind: "single";
  row: number;
  studentId: string;
  teacherId: string;
  roomId: string;
  branchId: string;
  instrument: Instrument;
  startAt: string;
  durationMinutes?: number;
  duplicate: boolean;
  /** TEACHER_UNAVAILABLE — soft warning, hard error değil. */
  availabilityWarning?: string;
};

export type SeriesLessonPlan = {
  kind: "series";
  row: number;
  label: string;
  /** `tekrar_gunleri`'nde birden fazla gün verildiyse (ör. Pazartesi|Çarşamba) — her gün için AYRI bir seri. */
  seriesParams: SeriesParams[];
  duplicate: boolean;
  occurrenceCount: number;
  firstDate: string;
  lastDate: string;
  /** Bu satırdaki oluşumlardan TEACHER_UNAVAILABLE olanlar — soft warning. */
  availabilityWarnings: string[];
};

export type LessonSchedulePlan = SingleLessonPlan | SeriesLessonPlan;

export type LessonScheduleImportPreview = {
  totalRows: number;
  errorCount: number;
  warningCount: number;
  errors: ImportRowError[];
  /** Hard error DEĞİL — yalnızca müsaitlik dışı (TEACHER_UNAVAILABLE) satır/oluşumlar. */
  warnings: ImportRowError[];
  valid: LessonSchedulePlan[];
  readRows: ImportReadRow[];
  summary: {
    seriesRowCount: number;
    singleLessonRowCount: number;
    totalLessonsToCreate: number;
    firstLessonDate?: string;
    lastLessonDate?: string;
  };
};

/**
 * Tek satırlık bir CSV kaydını değerlendirir. `tekrar_tipi` boş/"once" ise
 * eski (tekil ders) davranışı BİREBİR korunur — yalnızca sütun adları
 * `baslangic_tarihi`/`baslangic_saati`/`ders_suresi_dk` yeni, ama eski
 * `tarih`/`saat`/`sure_dk` adları da fallback olarak okunur.
 */
export function validateLessonScheduleRows(
  data: AppData,
  records: CsvRecord[],
  activeInstrumentNames: string[] = [...INSTRUMENTS],
  options?: { term?: StudentTermType; academicYearStart?: number }
): LessonScheduleImportPreview {
  const errors: ImportRowError[] = [];
  const warnings: ImportRowError[] = [];
  const valid: LessonSchedulePlan[] = [];
  const readRows: ImportReadRow[] = [];
  let simulatedLessons = data.lessons;
  let simulatedSeries = data.lessonSeries;

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const studentValue = rec["ogrenci"] ?? "";
    const teacherValue = rec["ogretmen"] ?? "";
    const branchValue = rec["sube"] ?? "";
    const roomValue = rec["oda"] ?? "";
    const instrumentValue = rec["enstruman"] ?? "";
    const dateValue = rec["baslangic_tarihi"] ?? rec["tarih"] ?? "";
    const endDateValue = rec["bitis_tarihi"] ?? "";
    const timeValue = rec["baslangic_saati"] ?? rec["saat"] ?? "";
    const durationValue = rec["ders_suresi_dk"] ?? rec["sure_dk"] ?? "";
    const repeatTypeValue = (rec["tekrar_tipi"] ?? "").trim().toLocaleLowerCase("tr") || "once";
    const repeatDaysValue = rec["tekrar_gunleri"] ?? "";
    const repeatIntervalValue = rec["tekrar_araligi"] ?? "";
    const totalRepeatValue = rec["toplam_tekrar"] ?? "";

    if (readRows.length < IMPORT_READ_ROWS_PREVIEW_LIMIT) {
      readRows.push({
        row,
        summary: `${studentValue || "(öğrenci boş)"} — ${teacherValue || "(öğretmen boş)"} — ${
          repeatTypeValue === "once" ? `${dateValue || "?"} ${timeValue || "?"}` : `${repeatTypeValue} · ${repeatDaysValue || "?"}`
        }`,
      });
    }

    let studentId: string | null = null;
    if (!studentValue) {
      errors.push({ row, field: "ogrenci", message: "Öğrenci adı boş olamaz." });
    } else {
      const resolved = resolveStudentIdByName(data, studentValue);
      if (!resolved.ok) errors.push({ row, field: "ogrenci", message: resolved.message });
      else studentId = resolved.studentId;
    }

    let teacherId: string | null = null;
    if (!teacherValue) {
      errors.push({ row, field: "ogretmen", message: "Öğretmen adı boş olamaz." });
    } else {
      const resolved = resolveTeacherIdByName(data, teacherValue);
      if (!resolved.ok) errors.push({ row, field: "ogretmen", message: resolved.message });
      else teacherId = resolved.teacherId;
    }

    let branchId: string | null = null;
    if (!branchValue) {
      errors.push({ row, field: "sube", message: "Şube boş olamaz." });
    } else {
      const resolved = resolveBranchId(data, branchValue);
      if (!resolved.ok) errors.push({ row, field: "sube", message: resolved.message });
      else branchId = resolved.branchId;
    }

    let roomId: string | null = null;
    if (!roomValue) {
      errors.push({ row, field: "oda", message: "Oda adı boş olamaz." });
    } else if (branchId) {
      const resolved = resolveRoomId(data, branchId, roomValue);
      if (!resolved.ok) errors.push({ row, field: "oda", message: resolved.message });
      else roomId = resolved.roomId;
    }

    let instrument: Instrument | null = null;
    if (!instrumentValue) {
      errors.push({ row, field: "enstruman", message: "Enstrüman boş olamaz." });
    } else {
      const canonical = resolveCanonicalValue(instrumentValue, activeInstrumentNames);
      if (!canonical || !isInstrument(canonical)) {
        errors.push({
          row,
          field: "enstruman",
          message: `Geçersiz enstrüman: "${instrumentValue}". Geçerli değerler: ${activeInstrumentNames.join(", ")}.`,
        });
      } else {
        instrument = canonical;
      }
    }

    if (!dateValue) {
      errors.push({ row, field: "baslangic_tarihi", message: "Başlangıç tarihi boş olamaz." });
    } else if (!DATE_RE.test(dateValue)) {
      errors.push({ row, field: "baslangic_tarihi", message: `Tarih "yyyy-aa-gg" biçiminde olmalı: "${dateValue}".` });
    }
    if (!timeValue) {
      errors.push({ row, field: "baslangic_saati", message: "Başlangıç saati boş olamaz." });
    } else if (!TIME_RE.test(timeValue)) {
      errors.push({ row, field: "baslangic_saati", message: `Saat "SS:DD" biçiminde olmalı: "${timeValue}".` });
    }

    let durationMinutes: number | undefined;
    if (!durationValue) {
      errors.push({ row, field: "ders_suresi_dk", message: "Ders süresi boş olamaz." });
    } else {
      const n = Number(durationValue);
      if (!(LESSON_DURATION_OPTIONS as readonly number[]).includes(n)) {
        errors.push({
          row,
          field: "ders_suresi_dk",
          message: `Ders süresi yalnızca ${LESSON_DURATION_OPTIONS.join("/")} dakika olabilir: "${durationValue}".`,
        });
      } else {
        durationMinutes = n;
      }
    }

    if (!["once", "weekly", "custom"].includes(repeatTypeValue)) {
      errors.push({
        row,
        field: "tekrar_tipi",
        message: `Geçersiz tekrar tipi: "${repeatTypeValue}". Geçerli değerler: once, weekly, custom.`,
      });
      return;
    }

    const canComposeStartAt = DATE_RE.test(dateValue) && TIME_RE.test(timeValue);
    if (!studentId || !teacherId || !roomId || !branchId || !instrument || !canComposeStartAt || durationMinutes === undefined) {
      return;
    }

    // ── Tekil ders (geriye dönük uyumlu — eski davranış birebir) ──────
    if (repeatTypeValue === "once") {
      const startAtIso = new Date(`${dateValue}T${timeValue}:00`).toISOString();
      if (findExactDuplicateLesson(simulatedLessons, teacherId, roomId, startAtIso)) {
        valid.push({
          kind: "single",
          row,
          studentId,
          teacherId,
          roomId,
          branchId,
          instrument,
          startAt: startAtIso,
          durationMinutes,
          duplicate: true,
        });
        return;
      }
      const slotCheck = validateLessonSlot(
        { ...data, lessons: simulatedLessons },
        { instrument, studentId },
        { teacherId, roomId, startAt: startAtIso },
        { durationMinutes, allowAvailabilityOverride: true }
      );
      if (!slotCheck.ok) {
        errors.push({ row, field: "baslangic_saati", message: slotCheck.message });
        return;
      }
      if (slotCheck.slot.availabilityOverridden) {
        warnings.push({
          row,
          field: "baslangic_saati",
          message: `Öğretmen bu saatte müsait görünmüyor (${teacherValue}, ${dateValue} ${timeValue}).`,
        });
      }
      valid.push({
        kind: "single",
        row,
        studentId,
        teacherId,
        roomId,
        branchId,
        instrument,
        startAt: slotCheck.slot.startAt,
        durationMinutes,
        duplicate: false,
        availabilityWarning: slotCheck.slot.availabilityOverridden ? "TEACHER_UNAVAILABLE" : undefined,
      });
      simulatedLessons = [
        ...simulatedLessons,
        {
          id: `__preview_${row}`,
          studentId,
          teacherId,
          roomId,
          branchId,
          instrument,
          startAt: slotCheck.slot.startAt,
          endAt: slotCheck.slot.endAt,
          type: "regular",
          status: "scheduled",
        } as AppData["lessons"][number],
      ];
      return;
    }

    // ── Tekrarlayan seri ────────────────────────────────────────────
    if (repeatTypeValue === "custom") {
      errors.push({
        row,
        field: "tekrar_tipi",
        message: '"custom" tekrar tipi henüz desteklenmiyor — yalnızca "once" veya "weekly" kullanın.',
      });
      return;
    }
    // weekly
    if (repeatIntervalValue && repeatIntervalValue.trim() !== "1") {
      errors.push({
        row,
        field: "tekrar_araligi",
        message: `Şu an yalnızca haftalık tekrar (tekrar_araligi=1) destekleniyor: "${repeatIntervalValue}".`,
      });
      return;
    }
    if (!repeatDaysValue.trim()) {
      errors.push({ row, field: "tekrar_gunleri", message: "Tekrarlayan ders için tekrar_gunleri boş olamaz." });
      return;
    }
    const dayTokens = repeatDaysValue.split("|").map((s) => s.trim()).filter(Boolean);
    const weekdays: number[] = [];
    let dayParseFailed = false;
    for (const token of dayTokens) {
      const wd = parseWeekday(token);
      if (wd === null) {
        errors.push({
          row,
          field: "tekrar_gunleri",
          message: `Geçersiz gün: "${token}". Türkçe gün adı (Pazartesi…Pazar) veya 0-6 kullanın.`,
        });
        dayParseFailed = true;
      } else {
        weekdays.push(wd);
      }
    }
    if (dayParseFailed) return;

    let endsOn = endDateValue.trim();
    if (!endsOn) {
      const totalRepeat = Number(totalRepeatValue);
      if (!totalRepeatValue || !Number.isInteger(totalRepeat) || totalRepeat < 1) {
        errors.push({
          row,
          field: "bitis_tarihi",
          message: "bitis_tarihi veya geçerli bir toplam_tekrar (pozitif tam sayı) verilmeli.",
        });
        return;
      }
      if (weekdays.length !== 1) {
        errors.push({
          row,
          field: "toplam_tekrar",
          message: "toplam_tekrar yalnızca tek bir tekrar günü (tekrar_gunleri) ile birlikte kullanılabilir — birden fazla gün için bitis_tarihi verin.",
        });
        return;
      }
      const start = new Date(`${dateValue}T00:00:00`);
      start.setDate(start.getDate() + (totalRepeat - 1) * 7);
      endsOn = start.toISOString().slice(0, 10);
    } else if (!DATE_RE.test(endsOn)) {
      errors.push({ row, field: "bitis_tarihi", message: `Tarih "yyyy-aa-gg" biçiminde olmalı: "${endsOn}".` });
      return;
    }

    const seriesParamsList: SeriesParams[] = weekdays.map((weekday) => ({
      studentId: studentId!,
      teacherId: teacherId!,
      roomId: roomId!,
      branchId: branchId!,
      instrument: instrument!,
      weekday,
      startTime: timeValue,
      durationMinutes: durationMinutes!,
      startsOn: dateValue,
      endsOn,
      term: options?.term,
      academicYearStart: options?.academicYearStart,
    }));

    const isDuplicate = seriesParamsList.every((p) => findExactDuplicateSeries(simulatedSeries, p));
    if (isDuplicate) {
      valid.push({
        kind: "series",
        row,
        label: `${studentValue} · ${dayTokens.join("/")} ${timeValue}`,
        seriesParams: seriesParamsList,
        duplicate: true,
        occurrenceCount: 0,
        firstDate: dateValue,
        lastDate: endsOn,
        availabilityWarnings: [],
      });
      return;
    }

    let occurrenceCount = 0;
    const availabilityWarnings: string[] = [];
    let hasHardError = false;
    for (const params of seriesParamsList) {
      const occurrences = computeSeriesOccurrences(params);
      const checks = checkSeriesOccurrences(
        { ...data, lessons: simulatedLessons, lessonSeries: simulatedSeries },
        params,
        occurrences,
        new Date(),
        true // allowAvailabilityOverride — TEACHER_UNAVAILABLE oluşumları burada HARD error değil, warning'e düşer
      );
      for (const check of checks) {
        if (!check.ok) {
          errors.push({
            row,
            field: "baslangic_saati",
            message: `${check.startAt.slice(0, 10)} — ${check.message}`,
          });
          hasHardError = true;
          continue;
        }
        occurrenceCount += 1;
        if (check.availabilityOverridden) {
          availabilityWarnings.push(`${check.startAt.slice(0, 10)} ${timeValue} — öğretmen müsait görünmüyor.`);
        }
      }
    }
    if (hasHardError) return;
    if (occurrenceCount === 0) {
      errors.push({ row, field: "bitis_tarihi", message: "Seçilen dönemde uygun tek bir tarih bile yok." });
      return;
    }
    for (const w of availabilityWarnings) {
      warnings.push({ row, field: "baslangic_saati", message: w });
    }

    valid.push({
      kind: "series",
      row,
      label: `${studentValue} · ${dayTokens.join("/")} ${timeValue}`,
      seriesParams: seriesParamsList,
      duplicate: false,
      occurrenceCount,
      firstDate: dateValue,
      lastDate: endsOn,
      availabilityWarnings,
    });
    // Önizlemedeki sonraki satırların çakışma kontrolüne dahil olsun diye
    // simüle edilen seri/ders listesine ekle (gerçek veriye yazılmaz).
    simulatedSeries = [
      ...simulatedSeries,
      ...seriesParamsList.map((p) => ({
        id: `__preview_series_${row}_${p.weekday}`,
        studentId: p.studentId,
        teacherId: p.teacherId,
        roomId: p.roomId,
        branchId: p.branchId,
        instrument: p.instrument,
        weekday: p.weekday,
        startTime: p.startTime,
        durationMinutes: p.durationMinutes,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as AppData["lessonSeries"],
    ];
  });

  const seriesRows = valid.filter((v): v is SeriesLessonPlan => v.kind === "series" && !v.duplicate);
  const singleRows = valid.filter((v): v is SingleLessonPlan => v.kind === "single" && !v.duplicate);
  const allDates = [
    ...singleRows.map((r) => r.startAt.slice(0, 10)),
    ...seriesRows.map((r) => r.firstDate),
    ...seriesRows.map((r) => r.lastDate),
  ].sort();

  return {
    totalRows: records.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    valid,
    readRows,
    summary: {
      seriesRowCount: seriesRows.length,
      singleLessonRowCount: singleRows.length,
      totalLessonsToCreate: singleRows.length + seriesRows.reduce((sum, r) => sum + r.occurrenceCount, 0),
      firstLessonDate: allDates[0],
      lastLessonDate: allDates[allDates.length - 1],
    },
  };
}
