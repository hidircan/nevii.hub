/**
 * 2026-10-04 — öğrenci bazında telafi özeti ve ayrıntısı (saf; I/O yok).
 *
 * İki ayrı kavram KARIŞTIRILMAZ:
 * - HAK: eğitim dönemi kotası (`getStudentMakeupQuota` — hak / kullanılan / kalan; öğretmen/kurum kaynaklı
 *   telafi kotadan düşmez). Hak bir ders değildir.
 * - TALEP/DERS: her telafi talebinin aşaması — bekleyen (planlanmamış), planlanmış (ders yazıldı, henüz
 *   işlenmedi), tamamlanmış (telafi dersi Geldi/İşlendi), iptal / süresi dolmuş.
 */
import { differenceInMinutes, parseISO } from "date-fns";
import { resolveLessonFinalStatus } from "./lesson-live-status";
import { getStudentMakeupQuota, makeupEnrollmentKey, type MakeupQuotaSnapshot } from "./makeup-quota";
import type { AppData, MakeupRequest, StudentRef } from "./types";

export type MakeupStage = "pending" | "planned" | "completed" | "cancelled" | "expired";

export const MAKEUP_STAGE_LABEL: Record<MakeupStage, string> = {
  pending: "Bekliyor (planlanmadı)",
  planned: "Planlandı",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  expired: "Süresi doldu",
};

export type StudentMakeupRow = {
  requestId: string;
  stage: MakeupStage;
  instrument: string;
  reason: string;
  expiresAt: string;
  sourceLessonAt?: string;
  sourceTeacherName?: string;
  durationMinutes?: number;
  plannedLessonAt?: string;
  plannedTeacherName?: string;
  decisionNote?: string;
};

export type StudentMakeupSummary = {
  quota: MakeupQuotaSnapshot;
  counts: Record<MakeupStage, number>;
  rows: StudentMakeupRow[];
};

export function makeupStageOf(req: MakeupRequest, data: Pick<AppData, "lessons">, now: Date = new Date()): MakeupStage {
  if (req.status === "cancelled") return "cancelled";
  if (req.status === "expired") return "expired";
  if (req.status === "completed") return "completed";
  if (req.status !== "confirmed") return "pending";
  const lesson = req.confirmedLessonId ? data.lessons.find((l) => l.id === req.confirmedLessonId) : undefined;
  if (!lesson) return "planned";
  const final = resolveLessonFinalStatus(lesson, now);
  if (final === "attended" || final === "processed") return "completed";
  if (final === "cancelled") return "cancelled";
  return "planned";
}

export function buildStudentMakeupSummary(
  data: Pick<AppData, "lessons" | "makeupRequests" | "teachers" | "settings"> & { students: StudentRef[] },
  studentId: string,
  now: Date = new Date(),
  /** 2026-10-09 — verilirse talepler ve hak yalnız bu branş kaydının (telafi hakkı branş başınadır). */
  enrollmentId?: string
): StudentMakeupSummary {
  const teacherName = (id?: string) => (id ? data.teachers.find((t) => t.id === id)?.name : undefined);
  const counts: Record<MakeupStage, number> = { pending: 0, planned: 0, completed: 0, cancelled: 0, expired: 0 };
  const rows = data.makeupRequests
    .filter((m) => m.studentId === studentId && (!enrollmentId || makeupEnrollmentKey(data, m.sourceLessonId) === enrollmentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m): StudentMakeupRow => {
      const stage = makeupStageOf(m, data, now);
      counts[stage] += 1;
      const source = data.lessons.find((l) => l.id === m.sourceLessonId);
      const planned = m.confirmedLessonId ? data.lessons.find((l) => l.id === m.confirmedLessonId) : undefined;
      const durationLesson = planned ?? source;
      return {
        requestId: m.id,
        stage,
        instrument: m.instrument,
        reason: m.reason,
        expiresAt: m.expiresAt,
        sourceLessonAt: source?.startAt,
        sourceTeacherName: teacherName(source?.teacherId ?? m.teacherId),
        durationMinutes: durationLesson
          ? differenceInMinutes(parseISO(durationLesson.endAt), parseISO(durationLesson.startAt))
          : undefined,
        plannedLessonAt: planned?.startAt,
        plannedTeacherName: teacherName(planned?.teacherId),
        decisionNote: m.decisionNote,
      };
    });
  return { quota: getStudentMakeupQuota(data as AppData, studentId, now, undefined, enrollmentId), counts, rows };
}
