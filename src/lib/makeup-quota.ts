/**
 * Kurum geneli telafi kotası — hak TAKVİM AYI değil, AKTİF EĞİTİM DÖNEMİ
 * (Güz/Yaz + akademik yıl) başına sayılır. Dönem çözümlemesi, program ve
 * yoklama takviminin ortak `resolveLessonAcademicPeriod` yardımcısından gelir;
 * ikinci bir tarih aralığı kuralı icat edilmez.
 * `monthlyMakeupAllowance` ayar alanı adı (geriye dönük teknik tanımlayıcı)
 * DEĞİŞTİRİLMEDİ; anlamı artık "eğitim dönemi başına hak".
 * Tüketir/rezerve eder: pending | suggested | awaiting_info | confirmed
 * Tüketmez: cancelled | expired (+ rejected yoksa ignored)
 */
import { isQuotaExemptSource } from "./lesson-disruption";
import type { AppData, MakeupRequest, MakeupStatus } from "./types";
import { resolveLessonAcademicPeriod } from "./attendance-calendar";
import { lessonEnrollmentId } from "./student-enrollments";

/**
 * 2026-10-09 — telafi hakkı BRANŞ başınadır: bir branşın devamsızlığı/telafisi diğer branşın hakkını tüketmez.
 * Kaynak dersin branşı `lessonEnrollmentId` ile çözülür (açık bağ → tek branş → enstrümanla tek eşleşme); tek
 * branşlı öğrencide tüm dersler aynı anahtara düşer (eski davranışla birebir aynı).
 */
export function makeupEnrollmentKey(data: import("./types").WithStudentRefs<Pick<AppData, "lessons" | "students" | "teachers">>, lessonId: string): string {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  const student = lesson ? data.students.find((s) => s.id === lesson.studentId) : undefined;
  return (lesson && student ? lessonEnrollmentId(student, lesson, data.teachers) : undefined) ?? "__unassigned__";
}

/** "2026" → "2026-2027" — kullanıcıya gösterilecek eğitim yılı etiketi, hiçbir yerde sabitlenmez. */
export function formatEducationYearLabel(academicYearStart: number): string {
  return `${academicYearStart}-${academicYearStart + 1}`;
}

export const TERM_MAKEUP_LIMIT = 2;
/** @deprecated Teknik ayar adı geriye dönük uyumluluk için korunur. */
export const DEFAULT_MONTHLY_MAKEUP_ALLOWANCE = TERM_MAKEUP_LIMIT;

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

/** @deprecated Yeni kota hesabında eğitim dönemi anahtarı kullanılır. */
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
  return TERM_MAKEUP_LIMIT;
}

export function formatEducationPeriodLabel(term: "guz" | "yaz", academicYearStart: number): string {
  return `${academicYearStart} ${term === "guz" ? "Güz" : "Yaz"} Dönemi`;
}

/** Bir dersin ait olduğu eğitim dönemi anahtarı, ör. "2026-guz". */
export function periodKeyForLesson(data: AppData, lessonId: string): string {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return "bilinmeyen-donem";
  const student = data.students.find((s) => s.id === lesson.studentId);
  const period = resolveLessonAcademicPeriod(lesson, student?.termType ?? "guz");
  return `${period.academicYearStart}-${period.term}`;
}

/**
 * 9. tur (owner kararı) — kaynağı öğretmen/kurum olan dersin telafisi öğrencinin
 * kişisel hakkından düşmez. Kaynak dersin `disruptionSource`'undan okunur; kaynağı
 * belirtilmemiş eski telafiler eskisi gibi sayılır (sessiz yeniden sınıflandırma yok).
 */
export function isQuotaExemptMakeup(data: Pick<AppData, "lessons">, sourceLessonId: string): boolean {
  return isQuotaExemptSource(data.lessons.find((l) => l.id === sourceLessonId)?.disruptionSource);
}

export function countStudentMakeupsInPeriod(data: AppData, studentId: string, periodKey: string, enrollmentKey?: string): number {
  return data.makeupRequests.filter((m) => {
    if (m.studentId !== studentId) return false;
    if (enrollmentKey && makeupEnrollmentKey(data, m.sourceLessonId) !== enrollmentKey) return false;
    if (!isMakeupStatusCountingTowardQuota(m.status)) return false;
    if (isQuotaExemptMakeup(data, m.sourceLessonId)) return false;
    return periodKeyForLesson(data, m.sourceLessonId) === periodKey;
  }).length;
}

/** @deprecated Dönem-bazlı `countStudentMakeupsInPeriod` kullan. */
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

/** confirmed = "kullanıldı"; pending/suggested/awaiting_info = "rezerve edildi". */
export const MAKEUP_QUOTA_RESERVED_STATUSES: readonly MakeupStatus[] = [
  "pending",
  "suggested",
  "awaiting_info",
] as const;

export type MakeupQuotaSnapshot = {
  allowance: number;
  used: number;
  confirmedUsed: number;
  reservedUsed: number;
  remaining: number;
  periodKey: string;
  periodLabel: string;
  periodResolved: boolean;
  /** Geriye dönük API alanı; yeni UI `periodLabel` kullanır. */
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
  sourceLessonId?: string,
  /** 2026-10-09 — özet ekranlarında branş; `sourceLessonId` verilirse o dersin branşı esas alınır. */
  enrollmentId?: string
): MakeupQuotaSnapshot {
  const allowance = resolveMonthlyMakeupAllowance(data.settings);
  const sourceLesson = sourceLessonId ? data.lessons.find((l) => l.id === sourceLessonId) : undefined;
  const student = data.students.find((s) => s.id === (sourceLesson?.studentId ?? studentId));
  // `sourceLessonId` verildiği halde derse ulaşılamıyorsa (silinmiş/tutarsız
  // veri) dönem güvenilir biçimde çözülemez — sessizce `now`'a düşülmez.
  const unresolvable = Boolean(sourceLessonId) && !sourceLesson;
  const period = unresolvable
    ? null
    : sourceLesson
      ? resolveLessonAcademicPeriod(sourceLesson, student?.termType ?? "guz")
      : resolveLessonAcademicPeriod({ startAt: now.toISOString() }, student?.termType ?? "guz");
  if (!period) {
    return {
      allowance,
      used: 0,
      confirmedUsed: 0,
      reservedUsed: 0,
      remaining: 0,
      periodKey: "bilinmeyen-donem",
      periodLabel: "Aktif eğitim dönemi belirlenemedi",
      periodResolved: false,
      educationYearLabel: "Aktif eğitim dönemi belirlenemedi",
    };
  }
  const activePeriodKey = `${period.academicYearStart}-${period.term}`;
  const periodLabel = formatEducationPeriodLabel(period.term, period.academicYearStart);
  const enrollmentKey = sourceLesson ? makeupEnrollmentKey(data, sourceLesson.id) : enrollmentId;
  const periodRequests = data.makeupRequests.filter(
    (m) =>
      m.studentId === studentId &&
      periodKeyForLesson(data, m.sourceLessonId) === activePeriodKey &&
      !isQuotaExemptMakeup(data, m.sourceLessonId) &&
      (!enrollmentKey || makeupEnrollmentKey(data, m.sourceLessonId) === enrollmentKey)
  );
  const confirmedUsed = periodRequests.filter((m) => m.status === "confirmed").length;
  const reservedUsed = periodRequests.filter((m) =>
    (MAKEUP_QUOTA_RESERVED_STATUSES as readonly string[]).includes(m.status)
  ).length;
  const used = confirmedUsed + reservedUsed;
  const remaining = Math.max(0, allowance - used);
  return {
    allowance,
    used,
    confirmedUsed,
    reservedUsed,
    remaining,
    periodKey: activePeriodKey,
    periodLabel,
    periodResolved: true,
    educationYearLabel: periodLabel,
  };
}

export function assertCanCreateMakeup(
  data: AppData,
  studentId: string,
  now: Date = new Date(),
  sourceLessonId?: string
): { ok: true; snapshot: MakeupQuotaSnapshot } | { ok: false; message: string; snapshot: MakeupQuotaSnapshot } {
  const snapshot = getStudentMakeupQuota(data, studentId, now, sourceLessonId);
  if (!snapshot.periodResolved) {
    return {
      ok: false,
      message: "Aktif eğitim dönemi belirlenemediği için telafi hakkı hesaplanamadı.",
      snapshot,
    };
  }
  // Öğretmen/kurum kaynaklı telafi kişisel hakka tabi değil — kota dolu/kapalı olsa da açılır.
  if (sourceLessonId && isQuotaExemptMakeup(data, sourceLessonId)) return { ok: true, snapshot };
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
      message: `Bu öğrenci bu branşta ${snapshot.periodLabel} içinde ${snapshot.allowance} telafi hakkını kullanmıştır (diğer branşların hakkı ayrıdır).`,
      snapshot,
    };
  }
  return { ok: true, snapshot };
}

/**
 * Kullanıcıya gösterilecek zorunlu sayaç metni. "kullanıldı" yalnız
 * onaylanmış (confirmed) telafiyi sayar; açık talepler (pending/suggested/
 * awaiting_info) ayrı olarak "rezerve edildi" ile gösterilir — kotayı
 * tüketmiş gibi görünmemeli ama kapasiteyi de gizlememeli.
 */
export function formatMakeupQuotaLabel(snapshot: MakeupQuotaSnapshot): string {
  const parts = [`${snapshot.confirmedUsed} / ${snapshot.allowance} kullanıldı`];
  if (snapshot.reservedUsed > 0) {
    parts.push(`${snapshot.reservedUsed} hak rezerve edildi`);
  }
  if (snapshot.remaining > 0) {
    parts.push(`${snapshot.remaining} hak kaldı`);
  } else {
    parts.push(snapshot.reservedUsed > 0 ? "Yeni telafi hakkı yok" : "Hak kalmadı");
  }
  return parts.join(" · ");
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
