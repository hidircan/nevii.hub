/**
 * Veri Aktarım Merkezi Faz 2 — Ders Programı importu. Diğer importer'larla
 * (teachers.ts/rooms.ts/students.ts) AYNI desen: saf `validateLessonRows`
 * (I/O yok, önizleme + commit ikisi de bunu çağırır) + store katmanındaki
 * `addLesson` (validateLessonSlot ÜZERİNDEN — bkz. src/lib/makeup-engine.ts —
 * mevcut program/telafi/ders oluşturma ile TEK doğrulama kaynağı, ikinci bir
 * paralel çakışma/uygunluk kontrolü YOK).
 *
 * İdempotency: aynı öğretmen+oda+başlangıç saatinde ZATEN var olan (iptal
 * edilmemiş) bir ders varsa satır "duplicate" sayılır — hata ÜRETMEZ, yeni
 * kayıt da OLUŞTURMAZ (aynı CSV'nin tekrar yüklenmesi kör duplicate
 * üretmez). Dosya İÇİNDEKİ satırlar arası çakışma da (henüz commit
 * edilmemiş olsalar bile) simüle edilerek yakalanır.
 */
import type { AppData, Instrument } from "../types";
import { zonedWallTimeToUtc } from "../timezone";
import { INSTRUMENTS } from "../types";
import type { CsvRecord } from "./csv";
import type { ImportPreview, ImportRowError, ImportReadRow } from "./types";
import { IMPORT_READ_ROWS_PREVIEW_LIMIT } from "./types";
import { resolveBranchId, resolveTeacherIdByName, resolveStudentIdByName } from "./branch-lookup";
import { validateLessonSlot } from "../makeup-engine";
import { LESSON_DURATION_OPTIONS } from "../lesson-duration";

export type LessonImportRow = {
  studentId: string;
  teacherId: string;
  roomId: string;
  instrument: Instrument;
  startAt: string;
  durationMinutes?: number;
  /** true ise bu satır zaten var olan bir dersle birebir eşleşiyor — commit'te oluşturulmaz, sayılır. */
  duplicate: boolean;
};

export const LESSON_CSV_COLUMNS = [
  "ogrenci",
  "ogretmen",
  "sube",
  "oda",
  "enstruman",
  "tarih",
  "saat",
  "sure_dk",
] as const;

export const LESSON_CSV_SAMPLE = `ogrenci,ogretmen,sube,oda,enstruman,tarih,saat,sure_dk
Zeynep Yıldız,Nilüfer Acar,Erzene,Stüdyo 1 — Piyano,Piyano,2026-09-07,14:00,40
`;

function isInstrument(value: string): value is Instrument {
  return (INSTRUMENTS as string[]).includes(value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/** Aynı öğretmen+oda+başlangıç saatinde (iptal edilmemiş) zaten var olan bir ders mi? */
function findExactDuplicate(
  lessons: AppData["lessons"],
  teacherId: string,
  roomId: string,
  startAtIso: string
): boolean {
  return lessons.some(
    (l) => l.teacherId === teacherId && l.roomId === roomId && l.startAt === startAtIso && l.status !== "cancelled"
  );
}

export function validateLessonRows(data: AppData, records: CsvRecord[]): ImportPreview<LessonImportRow> {
  const errors: ImportRowError[] = [];
  const valid: LessonImportRow[] = [];
  const readRows: ImportReadRow[] = [];
  // Dosya içindeki (henüz commit edilmemiş) satırları da çakışma
  // kontrolüne dahil etmek için — gerçek veriye eklenmez, yalnız bu
  // fonksiyon içinde simülasyon amaçlı.
  let simulatedLessons = data.lessons;

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const studentValue = rec["ogrenci"] ?? "";
    const teacherValue = rec["ogretmen"] ?? "";
    const branchValue = rec["sube"] ?? "";
    const roomValue = rec["oda"] ?? "";
    const instrumentValue = rec["enstruman"] ?? "";
    const dateValue = rec["tarih"] ?? "";
    const timeValue = rec["saat"] ?? "";
    const durationValue = rec["sure_dk"] ?? "";

    if (readRows.length < IMPORT_READ_ROWS_PREVIEW_LIMIT) {
      readRows.push({
        row,
        summary: `${studentValue || "(öğrenci boş)"} — ${teacherValue || "(öğretmen boş)"} — ${dateValue || "?"} ${timeValue || "?"}`,
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
    } else if (!isInstrument(instrumentValue)) {
      errors.push({
        row,
        field: "enstruman",
        message: `Geçersiz enstrüman: "${instrumentValue}". Geçerli değerler: ${INSTRUMENTS.join(", ")}.`,
      });
    } else {
      instrument = instrumentValue;
    }

    if (!dateValue) {
      errors.push({ row, field: "tarih", message: "Tarih boş olamaz." });
    } else if (!DATE_RE.test(dateValue)) {
      errors.push({ row, field: "tarih", message: `Tarih "yyyy-aa-gg" biçiminde olmalı: "${dateValue}".` });
    }
    if (!timeValue) {
      errors.push({ row, field: "saat", message: "Saat boş olamaz." });
    } else if (!TIME_RE.test(timeValue)) {
      errors.push({ row, field: "saat", message: `Saat "SS:DD" biçiminde olmalı: "${timeValue}".` });
    }

    let durationMinutes: number | undefined;
    if (durationValue) {
      const n = Number(durationValue);
      if (!(LESSON_DURATION_OPTIONS as readonly number[]).includes(n)) {
        errors.push({
          row,
          field: "sure_dk",
          message: `Ders süresi yalnızca ${LESSON_DURATION_OPTIONS.join("/")} dakika olabilir: "${durationValue}".`,
        });
      } else {
        durationMinutes = n;
      }
    }

    const canComposeStartAt = DATE_RE.test(dateValue) && TIME_RE.test(timeValue);
    if (!studentId || !teacherId || !roomId || !instrument || !canComposeStartAt) return;

    const startAtIso = zonedWallTimeToUtc(dateValue, timeValue).toISOString();

    if (findExactDuplicate(simulatedLessons, teacherId, roomId, startAtIso)) {
      valid.push({ studentId, teacherId, roomId, instrument, startAt: startAtIso, durationMinutes, duplicate: true });
      return;
    }

    const slotCheck = validateLessonSlot(
      { ...data, lessons: simulatedLessons },
      { instrument, studentId },
      { teacherId, roomId, startAt: startAtIso },
      { durationMinutes }
    );
    if (!slotCheck.ok) {
      errors.push({ row, field: "saat", message: slotCheck.message });
      return;
    }

    valid.push({ studentId, teacherId, roomId, instrument, startAt: startAtIso, durationMinutes, duplicate: false });
    // Sonraki satırların çakışma kontrolüne dahil olsun diye simüle edilen listeye ekle.
    simulatedLessons = [
      ...simulatedLessons,
      {
        id: `__preview_${row}`,
        studentId,
        teacherId,
        roomId,
        branchId: slotCheck.slot.branchId,
        instrument,
        startAt: slotCheck.slot.startAt,
        endAt: slotCheck.slot.endAt,
        type: "regular",
        status: "scheduled",
        studentAttended: false,
        lessonProcessed: false,
        opsMakeupFlag: false,
        opsClosedFlag: false,
      } as AppData["lessons"][number],
    ];
  });

  return {
    totalRows: records.length,
    validCount: valid.length,
    errorCount: errors.length,
    errors,
    valid,
    readRows,
  };
}
