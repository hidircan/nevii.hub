/**
 * Günlük Özet — deneme dersleri bölümü (2026-09-26). Saf fonksiyon: şube
 * süzgeci Günlük Özet'in seçili şubesiyle aynı; yetki süzgeci çağıranda
 * (`listTrialLessonsTool` — öğretmen yalnız kendi denemesini görür).
 */

import { TRIAL_STATUS_LABELS } from "../trial-lesson-labels";
import { DEFAULT_APP_TIMEZONE, addDaysYmd, toZonedYmd } from "../timezone";
import type { TrialLesson } from "../types";

export type TrialDigestItem = {
  id: string;
  name: string;
  startAt: string;
  dayYmd: string;
  branchName: string;
  teacherName: string;
  instrument: string;
  statusLabel: string;
  /** Hazırlık notu (kısaltılmış). */
  prepNote?: string;
  /** Aksiyon gerektiren durum; yoksa undefined. */
  action?: string;
  href: string;
};

export type TrialDigest = {
  today: TrialDigestItem[];
  upcoming: TrialDigestItem[];
  needsAction: TrialDigestItem[];
};

/** Yaklaşan penceresi (bugün hariç) ve geriye dönük aksiyon penceresi. */
export const TRIAL_DIGEST_UPCOMING_DAYS = 7;
export const TRIAL_DIGEST_LOOKBACK_DAYS = 30;

const snippet = (s?: string) => (s && s.trim() ? (s.trim().length > 90 ? `${s.trim().slice(0, 87)}…` : s.trim()) : undefined);

/** Gerçekleşmiş denemede eksik kalan iş — öncelik: statü → kayıt kararı → sonuç notu. */
export function trialFollowUpAction(t: Pick<TrialLesson, "status" | "convertedStudentId" | "resultNotes">): string | undefined {
  if (t.convertedStudentId || t.status === "cancelled" || t.status === "will_not_continue") return undefined;
  if (t.status === "planned") return "Durum güncellenmedi — katıldı mı?";
  if (t.status === "awaiting_enrollment" || t.status === "will_continue") return "Kayda dönüştürülmedi";
  if (!t.resultNotes?.trim()) return "Sonuç notu bekliyor";
  return undefined;
}

export function buildTrialDigest(
  trials: TrialLesson[],
  opts: {
    branchId: string;
    now: Date;
    teachers: Array<{ id: string; name: string }>;
    branches: Array<{ id: string; shortName?: string; name?: string }>;
  }
): TrialDigest {
  const today = toZonedYmd(opts.now, DEFAULT_APP_TIMEZONE);
  const upTo = addDaysYmd(today, TRIAL_DIGEST_UPCOMING_DAYS);
  const since = addDaysYmd(today, -TRIAL_DIGEST_LOOKBACK_DAYS);
  const nowMs = opts.now.getTime();
  const teacherName = new Map(opts.teachers.map((t) => [t.id, t.name]));
  const branchName = new Map(opts.branches.map((b) => [b.id, b.shortName || b.name || b.id]));

  const digest: TrialDigest = { today: [], upcoming: [], needsAction: [] };
  for (const t of trials) {
    if (opts.branchId !== "all" && t.branchId !== opts.branchId) continue;
    if (t.status === "cancelled") continue;
    const dayYmd = toZonedYmd(new Date(t.startAt), DEFAULT_APP_TIMEZONE);
    const finished = new Date(t.endAt).getTime() <= nowMs;
    const item: TrialDigestItem = {
      id: t.id,
      name: t.name,
      startAt: t.startAt,
      dayYmd,
      branchName: branchName.get(t.branchId) ?? "—",
      teacherName: teacherName.get(t.teacherId) ?? "—",
      instrument: t.instrument,
      statusLabel: TRIAL_STATUS_LABELS[t.status] ?? t.status,
      prepNote: snippet(t.notes),
      action: finished ? trialFollowUpAction(t) : undefined,
      href: `/panel/deneme?deneme=${encodeURIComponent(t.id)}`,
    };
    if (dayYmd === today) digest.today.push(item);
    else if (dayYmd > today && dayYmd <= upTo && !t.convertedStudentId) digest.upcoming.push(item);
    else if (dayYmd < today && dayYmd >= since && item.action) digest.needsAction.push(item);
  }
  const asc = (a: TrialDigestItem, b: TrialDigestItem) => a.startAt.localeCompare(b.startAt);
  digest.today.sort(asc);
  digest.upcoming.sort(asc);
  digest.needsAction.sort((a, b) => b.startAt.localeCompare(a.startAt));
  return digest;
}
