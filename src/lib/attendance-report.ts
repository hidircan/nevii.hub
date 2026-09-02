/**
 * P0-2C — Yönetici Yoklama Raporu: filtre/metrik/satır hesaplama motoru.
 * Saf fonksiyonlar; I/O yok. `getAttendanceReportTool` (tools.ts) bu
 * dosyadan `readData()` sonrası çağrılır — RBAC/tenant scoping tool
 * katmanının işi, burası yalnız hesaplama.
 */
import { toZonedYmd, DEFAULT_APP_TIMEZONE } from "./timezone";
import { effectiveLessonOpsStatus, type LessonOpsFlag } from "./lesson-ops";
import { evaluateAttendanceRisk } from "./attendance-risk";

export type AttendanceReportDatePreset = "today" | "this_week" | "this_month" | "custom";
export type AttendanceReportRowStatus = LessonOpsFlag | "cancelled" | "planned";

function todayYmd(now: Date): string {
  return toZonedYmd(now, DEFAULT_APP_TIMEZONE);
}

/** Pazartesi başlangıçlı hafta — Europe/Istanbul takvim günü aritmetiği. */
export function resolveReportDateRange(
  preset: AttendanceReportDatePreset,
  custom?: { from: string; to: string },
  now: Date = new Date()
): { from: string; to: string } {
  const today = todayYmd(now);
  if (preset === "custom") {
    if (!custom?.from || !custom?.to) {
      throw new Error("Özel tarih aralığı için başlangıç ve bitiş tarihi zorunludur.");
    }
    if (custom.to < custom.from) {
      throw new Error("Bitiş tarihi başlangıç tarihinden önce olamaz.");
    }
    return { from: custom.from, to: custom.to };
  }
  if (preset === "today") return { from: today, to: today };

  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const noon = new Date(Date.UTC(y, m - 1, d, 12));

  if (preset === "this_week") {
    const dow = noon.getUTCDay(); // 0=Pazar..6=Cumartesi
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(noon);
    monday.setUTCDate(noon.getUTCDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
  }

  // this_month
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}` };
}

export interface AttendanceReportLessonInput {
  id: string;
  studentId: string;
  teacherId: string;
  branchId: string;
  roomId: string;
  instrument: string;
  startAt: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
  studentAttended?: boolean;
  lessonProcessed?: boolean;
  lessonProcessedReason?: string;
  opsMakeupFlag?: boolean;
  studentAbsent?: boolean;
  studentExcused?: boolean;
}

export interface AttendanceReportMakeupInput {
  sourceLessonId: string;
  reason: string;
}

export interface AttendanceReportFilters {
  from: string; // yyyy-MM-dd, dahil
  to: string; // yyyy-MM-dd, dahil
  studentId?: string;
  teacherId?: string;
  branchId?: string;
  instrument?: string;
  roomId?: string;
  status?: AttendanceReportRowStatus;
}

export interface AttendanceReportRow {
  lessonId: string;
  studentId: string;
  teacherId: string;
  branchId: string;
  roomId: string;
  instrument: string;
  startAt: string;
  status: AttendanceReportRowStatus;
  processedReason?: string;
  makeupReason?: string;
  studentAtRisk: boolean;
}

export interface AttendanceReportSummary {
  totalPlanned: number;
  attended: number;
  absent: number;
  excused: number;
  processed: number;
  makeup: number;
  cancelled: number;
  riskyStudentCount: number;
}

export interface AttendanceReportResult {
  rows: AttendanceReportRow[];
  summary: AttendanceReportSummary;
}

function rowStatus(lesson: AttendanceReportLessonInput): AttendanceReportRowStatus {
  if (lesson.status === "cancelled") return "cancelled";
  return effectiveLessonOpsStatus(lesson) ?? "planned";
}

/**
 * Riskli öğrenci kümesi — TÜM (filtrelenmemiş) dersler üzerinden hesaplanır,
 * filtreye göre DEĞİL (bir öğretmen/şube filtresi uygulandığında bile aynı
 * öğrencinin gerçek aylık risk durumu değişmemeli). `evaluateAttendanceRisk`
 * ile AYNI eşik/ay mantığı — paralel bir ikinci risk hesaplaması İCAT
 * EDİLMEDİ.
 */
function computeRiskyStudentIds(allLessons: AttendanceReportLessonInput[]): Set<string> {
  const risky = new Set<string>();
  const byStudent = new Map<string, AttendanceReportLessonInput[]>();
  for (const l of allLessons) {
    if (!l.lessonProcessed) continue;
    const list = byStudent.get(l.studentId) ?? [];
    list.push(l);
    byStudent.set(l.studentId, list);
  }
  for (const [studentId, lessons] of byStudent) {
    for (const lesson of lessons) {
      const evaluation = evaluateAttendanceRisk(lessons, studentId, lesson);
      if (evaluation.crossedThreshold) {
        risky.add(studentId);
        break;
      }
    }
  }
  return risky;
}

export function buildAttendanceReport(
  allLessons: AttendanceReportLessonInput[],
  makeupRequests: AttendanceReportMakeupInput[],
  filters: AttendanceReportFilters
): AttendanceReportResult {
  const makeupReasonBySourceLessonId = new Map(makeupRequests.map((m) => [m.sourceLessonId, m.reason]));
  const riskyStudentIds = computeRiskyStudentIds(allLessons);

  const inRange = allLessons.filter((l) => {
    const day = toZonedYmd(new Date(l.startAt), DEFAULT_APP_TIMEZONE);
    return day >= filters.from && day <= filters.to;
  });

  const rows: AttendanceReportRow[] = inRange
    .filter((l) => !filters.studentId || l.studentId === filters.studentId)
    .filter((l) => !filters.teacherId || l.teacherId === filters.teacherId)
    .filter((l) => !filters.branchId || l.branchId === filters.branchId)
    .filter((l) => !filters.instrument || l.instrument === filters.instrument)
    .filter((l) => !filters.roomId || l.roomId === filters.roomId)
    .map((l) => ({
      lessonId: l.id,
      studentId: l.studentId,
      teacherId: l.teacherId,
      branchId: l.branchId,
      roomId: l.roomId,
      instrument: l.instrument,
      startAt: l.startAt,
      status: rowStatus(l),
      processedReason: l.lessonProcessedReason,
      makeupReason: makeupReasonBySourceLessonId.get(l.id),
      studentAtRisk: riskyStudentIds.has(l.studentId),
    }))
    .filter((row) => !filters.status || row.status === filters.status)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const summary: AttendanceReportSummary = {
    totalPlanned: rows.length,
    attended: rows.filter((r) => r.status === "attended").length,
    absent: rows.filter((r) => r.status === "absent").length,
    excused: rows.filter((r) => r.status === "excused").length,
    processed: rows.filter((r) => r.status === "processed").length,
    makeup: rows.filter((r) => r.status === "makeup").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    riskyStudentCount: new Set(rows.filter((r) => r.studentAtRisk).map((r) => r.studentId)).size,
  };

  return { rows, summary };
}
