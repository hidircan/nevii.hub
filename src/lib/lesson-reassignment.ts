/**
 * Faz 13 — bir dersin öğretmenini ve/veya şubesini (+ gerekiyorsa odasını)
 * değiştirir. `cancelSeriesFromLesson`/`cancelEntireSeries` (lesson-series.ts)
 * İLE AYNI üçlü kapsam deseni: "single" | "fromHereOnward" | "entireSeries".
 * Çakışma/uygunluk kontrolü TEK kaynaktan (`validateLessonSlot`,
 * `excludeLessonId` ile kendisiyle çakışma sayılmaz) — burada yeniden
 * yazılmaz. Seri yenileme/genişletme özelliği YOK (kod tabanında
 * doğrulandı) — bu yüzden "fromHereOnward"da seriyi ikiye BÖLMEK yerine
 * (gereksiz karmaşıklık), LessonSeries kaydının kendisi YENİ atamayı
 * yansıtacak şekilde güncellenir (raporlama/gruplama için); GEÇMİŞ
 * Lesson satırları KENDİ (değişmeyen) teacherId/branchId/roomId'sini korur
 * — bir dersin gösterilen öğretmeni HER ZAMAN kendi Lesson satırından
 * gelir, seriden DEĞİL.
 */
import { parseISO, differenceInMinutes } from "date-fns";
import type { AppData, BranchId, Lesson, LessonSeriesStatus } from "./types";
import { validateLessonSlot, type SlotValidationCode } from "./makeup-engine";
import type { ConflictWindow } from "./lesson-scope";

export type LessonReassignmentScope = "single" | "fromHereOnward" | "entireSeries";

export type ReassignLessonInput = {
  lessonId: string;
  scope: LessonReassignmentScope;
  newTeacherId?: string;
  newBranchId?: BranchId;
  newRoomId?: string;
};

export type ReassignLessonPreview = {
  affectedLessonIds: string[];
  previousTeacherId: string;
  previousBranchId: BranchId;
  previousRoomId: string;
  newTeacherId: string;
  newBranchId: BranchId;
  newRoomId: string;
};

export type ReassignLessonResult =
  | { ok: true; data: AppData; preview: ReassignLessonPreview }
  | { ok: false; code: "LESSON_NOT_FOUND" | "NO_CHANGE_REQUESTED" | "NOT_IN_SERIES"; message: string }
  | {
      ok: false;
      code: "BLOCKED_BY_CONFLICT";
      message: string;
      conflicts: { lessonId: string; startAt: string; code: SlotValidationCode; message: string }[];
    };

export function reassignLessonTeacherOrBranch(
  data: AppData,
  input: ReassignLessonInput,
  now: Date = new Date()
): ReassignLessonResult {
  const lesson = data.lessons.find((l) => l.id === input.lessonId);
  if (!lesson) return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };

  if (!input.newTeacherId && !input.newBranchId && !input.newRoomId) {
    return { ok: false, code: "NO_CHANGE_REQUESTED", message: "En az öğretmen veya şube/oda değişikliği belirtin." };
  }

  let targetLessons: Lesson[];
  if (input.scope === "single") {
    targetLessons = [lesson];
  } else {
    if (!lesson.seriesId) {
      return {
        ok: false,
        code: "NOT_IN_SERIES",
        message: "Bu ders bir seriye ait değil — yalnızca 'tek ders' kapsamı kullanılabilir.",
      };
    }
    const cutoff = input.scope === "fromHereOnward" ? parseISO(lesson.startAt) : null;
    targetLessons = data.lessons.filter((l) => {
      if (l.seriesId !== lesson.seriesId) return false;
      if (l.status !== "scheduled") return false;
      if (cutoff && parseISO(l.startAt) < cutoff) return false;
      return true;
    });
  }

  const newTeacherId = input.newTeacherId ?? lesson.teacherId;
  const newBranchId = input.newBranchId ?? lesson.branchId;
  const newRoomId = input.newRoomId ?? lesson.roomId;

  const checks = targetLessons.map((l) => ({
    lessonId: l.id,
    startAt: l.startAt,
    result: validateLessonSlot(
      data,
      { instrument: l.instrument, studentId: l.studentId },
      { teacherId: newTeacherId, roomId: newRoomId, startAt: l.startAt },
      { excludeLessonId: l.id, now, durationMinutes: differenceInMinutes(parseISO(l.endAt), parseISO(l.startAt)) }
    ),
  }));

  const conflicts = checks.filter((c) => !c.result.ok);
  if (conflicts.length > 0) {
    return {
      ok: false,
      code: "BLOCKED_BY_CONFLICT",
      message: `${conflicts.length} ders yeni öğretmen/oda ile çakışıyor — hiçbir değişiklik uygulanmadı.`,
      conflicts: conflicts.map((c) => ({
        lessonId: c.lessonId,
        startAt: c.startAt,
        code: (c.result as { ok: false; code: SlotValidationCode }).code,
        message: (c.result as { ok: false; message: string }).message,
      })),
    };
  }

  const targetIds = new Set(targetLessons.map((l) => l.id));
  const lessons = data.lessons.map((l) =>
    targetIds.has(l.id) ? { ...l, teacherId: newTeacherId, branchId: newBranchId, roomId: newRoomId } : l
  );

  let lessonSeries = data.lessonSeries;
  if (input.scope !== "single" && lesson.seriesId) {
    lessonSeries = data.lessonSeries.map((s) =>
      s.id === lesson.seriesId
        ? {
            ...s,
            teacherId: newTeacherId,
            branchId: newBranchId,
            roomId: newRoomId,
            status: s.status as LessonSeriesStatus,
            updatedAt: now.toISOString(),
          }
        : s
    );
  }

  return {
    ok: true,
    data: { ...data, lessons, lessonSeries },
    preview: {
      affectedLessonIds: [...targetIds],
      previousTeacherId: lesson.teacherId,
      previousBranchId: lesson.branchId,
      previousRoomId: lesson.roomId,
      newTeacherId,
      newBranchId,
      newRoomId,
    },
  };
}

/** DB egress (2026-10-18) — değişimin çakışma penceresi: yeni öğretmen/oda × serinin (veya tek dersin) günleri. */
export function reassignConflictWindow(data: AppData, input: ReassignLessonInput): ConflictWindow | undefined {
  const lesson = data.lessons.find((l) => l.id === input.lessonId);
  if (!lesson) return undefined;
  const targets = input.scope !== "single" && lesson.seriesId ? data.lessons.filter((l) => l.seriesId === lesson.seriesId) : [lesson];
  return {
    teacherIds: [input.newTeacherId ?? lesson.teacherId],
    roomIds: [input.newRoomId ?? lesson.roomId],
    days: targets.map((l) => parseISO(l.startAt)),
  };
}
