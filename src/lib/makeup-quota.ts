/**
 * Kurum geneli telafi kotası — sahibi onaylı NİHAİ karar (2026-08-29,
 * `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md` ve
 * `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`): hak,
 * TAKVİM AYI değil de TAM EĞİTİM YILI (2026-2027'nin TAMAMI) başına
 * sayılır — Güz+Yaz AYRI AYRI 2'şer hak DEĞİL, TÜMÜ birlikte toplam 2 hak.
 * Önceki bir oturumda `resolveLessonAcademicPeriod`'un döndürdüğü
 * `${academicYearStart}-${term}` (Güz/Yaz'ı AYIRAN) anahtar kullanılmıştı —
 * bu sahibi kararıyla YANLIŞ olduğu netleşti, DÜZELTİLDİ: yalnızca
 * `academicYearStart` kullanılır, `term` OKUNMAZ/YOK SAYILIR — aynı akademik
 * yılın Güz ve Yaz dersleri artık AYNI kota anahtarına düşer. Akademik yıl
 * sınırının kendisi (hangi ayın yıl başlangıcı sayıldığı) hâlâ
 * `resolveLessonAcademicPeriod` (attendance-calendar.ts) ile PAYLAŞILAN tek
 * kaynaktan gelir — ikinci bir "yıl" hesaplama mantığı İCAT EDİLMEDİ,
 * yalnızca `term` bileşeni kota anahtarından ÇIKARILDI.
 * `monthlyMakeupAllowance` ayar alanı adı (teknik tanımlayıcı, DB şeması)
 * DEĞİŞTİRİLMEDİ; anlamı artık "eğitim yılı başına hak".
 * Tüketir/rezerve eder: pending | suggested | awaiting_info | confirmed
 * Tüketmez: cancelled | expired (+ rejected yoksa ignored)
 */
import type { AppData, MakeupRequest, MakeupStatus } from "./types";
import { resolveLessonAcademicPeriod } from "./attendance-calendar";

/** "2026" → "2026-2027" — kullanıcıya gösterilecek eğitim yılı etiketi, hiçbir yerde sabitlenmez. */
export function formatEducationYearLabel(academicYearStart: number): string {
  return `${academicYearStart}-${academicYearStart + 1}`;
}

export const DEFAULT_MONTHLY_MAKEUP_ALLOWANCE = 2;

/** Kotaya yazılan durumlar (açık + onaylı). */
export const MAKEUP_QUOTA_COUNTING_STATUSES: readonly MakeupStatus[] = [
  "pending",
  "suggested",
  "awaiting_info",
  "confirmed",
] as const;

export function isMakeupStatusCountingTowardQuota(status: MakeupStatus): boolean {
  return (MAKEUP_QUOTA_COUNTING_STATUSES as readonly string[]).includes(status);
}

/** Kurum timezone bağımsız takvim ayı anahtarı YYYY-MM (ISO anın yerel ayı). */
export function calendarMonthKey(iso: string, now: Date = new Date()): string {
  const d = iso ? new Date(iso) : now;
  if (Number.isNaN(d.getTime())) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function resolveMonthlyMakeupAllowance(settings: {
  monthlyMakeupAllowance?: number | null;
}): number {
  const v = settings.monthlyMakeupAllowance;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  return DEFAULT_MONTHLY_MAKEUP_ALLOWANCE;
}

/** Bir dersin ait olduğu TAM EĞİTİM YILI anahtarı (Güz/Yaz AYIRT EDİLMEZ), ör. "2026". */
export function periodKeyForLesson(data: AppData, lessonId: string): string {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return "bilinmeyen-donem";
  const student = data.students.find((s) => s.id === lesson.studentId);
  const period = resolveLessonAcademicPeriod(lesson, student?.termType ?? "guz");
  return String(period.academicYearStart);
}

export function countStudentMakeupsInPeriod(data: AppData, studentId: string, periodKey: string): number {
  return data.makeupRequests.filter((m) => {
    if (m.studentId !== studentId) return false;
    if (!isMakeupStatusCountingTowardQuota(m.status)) return false;
    return periodKeyForLesson(data, m.sourceLessonId) === periodKey;
  }).length;
}

/** @deprecated Dönem-bazlı `countStudentMakeupsInPeriod` kullan — takvim ayı politika ile UYUMSUZ. */
export function countStudentMakeupsInMonth(
  requests: MakeupRequest[],
  studentId: string,
  monthKey: string
): number {
  return requests.filter((m) => {
    if (m.studentId !== studentId) return false;
    if (!isMakeupStatusCountingTowardQuota(m.status)) return false;
    return calendarMonthKey(m.createdAt) === monthKey;
  }).length;
}

export type MakeupQuotaSnapshot = {
  allowance: number;
  used: number;
  remaining: number;
  periodKey: string;
  /** Kullanıcıya gösterilecek eğitim yılı, ör. "2026-2027" — hiçbir yerde sabitlenmez. */
  educationYearLabel: string;
};

/**
 * `sourceLessonId` verilirse (yeni bir devamsızlık/iptal için kota
 * kontrolü) o dersin eğitim yılı kullanılır — bu, doğru yılı belirlemenin
 * TEK güvenilir yoludur (bir sonraki dersin tarihi henüz bilinmeyebilir).
 * Verilmezse (ör. genel özet ekranı) `now` anındaki eğitim yılı kullanılır.
 */
export function getStudentMakeupQuota(
  data: AppData,
  studentId: string,
  now: Date = new Date(),
  sourceLessonId?: string
): MakeupQuotaSnapshot {
  const allowance = resolveMonthlyMakeupAllowance(data.settings);
  const academicYearStart = sourceLessonId
    ? (() => {
        const lesson = data.lessons.find((l) => l.id === sourceLessonId);
        const student = data.students.find((s) => s.id === (lesson?.studentId ?? studentId));
        const period = resolveLessonAcademicPeriod(
          lesson ?? { startAt: now.toISOString() },
          student?.termType ?? "guz"
        );
        return period.academicYearStart;
      })()
    : (() => {
        const student = data.students.find((s) => s.id === studentId);
        const period = resolveLessonAcademicPeriod({ startAt: now.toISOString() }, student?.termType ?? "guz");
        return period.academicYearStart;
      })();
  const periodKey = String(academicYearStart);
  const used = countStudentMakeupsInPeriod(data, studentId, periodKey);
  const remaining = Math.max(0, allowance - used);
  return { allowance, used, remaining, periodKey, educationYearLabel: formatEducationYearLabel(academicYearStart) };
}

export function assertCanCreateMakeup(
  data: AppData,
  studentId: string,
  now: Date = new Date(),
  sourceLessonId?: string
): { ok: true; snapshot: MakeupQuotaSnapshot } | { ok: false; message: string; snapshot: MakeupQuotaSnapshot } {
  const snapshot = getStudentMakeupQuota(data, studentId, now, sourceLessonId);
  if (snapshot.allowance === 0) {
    return {
      ok: false,
      message: "Bu kurumda telafi talebi kapalıdır (dönem başına hak: 0).",
      snapshot,
    };
  }
  if (snapshot.used >= snapshot.allowance) {
    return {
      ok: false,
      message: `Bu öğrenci ${snapshot.educationYearLabel} eğitim döneminde ${snapshot.allowance} telafi hakkını kullanmıştır.`,
      snapshot,
    };
  }
  return { ok: true, snapshot };
}

/** Sahibi onaylı zorunlu metin: "2026-2027 eğitim dönemi için kalan telafi hakkı: X / 2". */
export function formatMakeupQuotaLabel(snapshot: MakeupQuotaSnapshot): string {
  return `${snapshot.educationYearLabel} eğitim dönemi için kalan telafi hakkı: ${snapshot.remaining} / ${snapshot.allowance}`;
}

export class MakeupQuotaExceededError extends Error {
  readonly code = "MAKEUP_QUOTA_EXCEEDED";
  constructor(message: string) {
    super(message);
    this.name = "MakeupQuotaExceededError";
  }
}

export function isMakeupQuotaExceededError(err: unknown): err is MakeupQuotaExceededError {
  if (err instanceof MakeupQuotaExceededError) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "MAKEUP_QUOTA_EXCEEDED"
  );
}
