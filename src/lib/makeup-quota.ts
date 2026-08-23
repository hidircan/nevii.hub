/**
 * Kurum geneli aylık telafi kotası.
 * Tüketir/rezerve eder: pending | suggested | awaiting_info | confirmed
 * Tüketmez: cancelled | expired (+ rejected yoksa ignored)
 */
import type { AppData, MakeupRequest, MakeupStatus } from "./types";

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
  monthKey: string;
};

export function getStudentMakeupQuota(
  data: AppData,
  studentId: string,
  now: Date = new Date()
): MakeupQuotaSnapshot {
  const allowance = resolveMonthlyMakeupAllowance(data.settings);
  const monthKey = calendarMonthKey(now.toISOString(), now);
  const used = countStudentMakeupsInMonth(data.makeupRequests, studentId, monthKey);
  const remaining = Math.max(0, allowance - used);
  return { allowance, used, remaining, monthKey };
}

export function assertCanCreateMakeup(
  data: AppData,
  studentId: string,
  now: Date = new Date()
): { ok: true; snapshot: MakeupQuotaSnapshot } | { ok: false; message: string; snapshot: MakeupQuotaSnapshot } {
  const snapshot = getStudentMakeupQuota(data, studentId, now);
  if (snapshot.allowance === 0) {
    return {
      ok: false,
      message: "Bu kurumda telafi talebi kapalıdır (aylık hak: 0).",
      snapshot,
    };
  }
  if (snapshot.used >= snapshot.allowance) {
    return {
      ok: false,
      message: `Bu öğrenci bu ayki ${snapshot.allowance} telafi hakkını kullanmıştır.`,
      snapshot,
    };
  }
  return { ok: true, snapshot };
}

export function formatMakeupQuotaLabel(snapshot: MakeupQuotaSnapshot): string {
  const left = snapshot.remaining;
  return `Bu ay: ${snapshot.used} / ${snapshot.allowance} telafi hakkı kullanıldı — ${left} hak kaldı.`;
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
