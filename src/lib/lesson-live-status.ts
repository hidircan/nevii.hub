/**
 * EPIC 8 (IMPLEMENTATION_PLAN.md) — ders başlat/bitiş ve canlı durum.
 * Saf fonksiyonlar (I/O yok) — durum geçişleri ve türetilmiş görüntüleme
 * durumu burada izole tutulur; testler (lesson-live-status.test.ts) her
 * geçişi ve düzeltme kuralını doğrular.
 */

import type { AppData, Lesson } from "./types";

export type LessonFinalStatus = "planned" | "attended" | "processed" | "makeup" | "cancelled";

export type LessonFinalStatusInput = Pick<
  Lesson,
  | "status"
  | "startAt"
  | "type"
  | "studentAttended"
  | "lessonProcessed"
  | "opsMakeupFlag"
>;

/** Kullanıcıya gösterilen tek nihai ders statüsü; gelecek dersler her zaman planlıdır. */
export function resolveLessonFinalStatus(
  lesson: LessonFinalStatusInput,
  now: Date = new Date()
): LessonFinalStatus {
  if (new Date(lesson.startAt).getTime() > now.getTime()) return "planned";
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.type === "makeup" || lesson.opsMakeupFlag) return "makeup";
  if (lesson.lessonProcessed) return "processed";
  if (lesson.studentAttended || lesson.status === "completed") return "attended";
  return "planned";
}

export type LiveDisplayStatus =
  | "scheduled"
  | "delayed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

/**
 * Kalıcı `status` alanından TÜRETİLİR, ayrıca saklanmaz. "delayed" yalnızca
 * `status === "scheduled"` VE planlanan `startAt` şu ana kadar geçmişse
 * gösterilir — dersin gerçekten geciktiğini değil, henüz başlatılmadığını
 * belirtir (öğretmen "Dersi başlat" demeden ekranda kalır).
 */
export function computeLiveDisplayStatus(
  lesson: Pick<Lesson, "status" | "startAt">,
  now: Date = new Date()
): LiveDisplayStatus {
  if (lesson.status === "in_progress") return "in_progress";
  if (lesson.status === "completed") return "completed";
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.status === "no_show") return "no_show";
  // status === "scheduled"
  if (new Date(lesson.startAt).getTime() < now.getTime()) return "delayed";
  return "scheduled";
}

export type LessonStartPatch = Pick<Lesson, "status" | "actualStartAt">;
export type LessonEndPatch = Pick<Lesson, "status" | "actualEndAt">;

/**
 * Erken/geç başlatma toleransı: planlanan saatten ne kadar önce/sonra
 * olursa olsun başlatma kabul edilir — bir öğretmenin 10 dakika erken veya
 * 20 dakika geç gelmesi olağan bir durumdur, hata değil. Yalnızca dersin
 * durumu (zaten başlamış/bitmiş/iptal) geçişi engeller.
 */
export function startLesson(
  lesson: Pick<Lesson, "status">,
  now: Date = new Date()
): { ok: true; patch: LessonStartPatch } | { ok: false; message: string } {
  if (lesson.status === "in_progress") {
    return { ok: false, message: "Ders zaten başlatılmış." };
  }
  if (lesson.status === "completed" || lesson.status === "cancelled" || lesson.status === "no_show") {
    return { ok: false, message: "Bu ders zaten sonuçlandırılmış, başlatılamaz." };
  }
  return { ok: true, patch: { status: "in_progress", actualStartAt: now.toISOString() } };
}

export function endLesson(
  lesson: Pick<Lesson, "status">,
  now: Date = new Date()
): { ok: true; patch: LessonEndPatch } | { ok: false; message: string } {
  if (lesson.status !== "in_progress") {
    return { ok: false, message: "Ders başlatılmadan bitirilemez." };
  }
  return { ok: true, patch: { status: "completed", actualEndAt: now.toISOString() } };
}

export type LessonTimeCorrection = {
  actualStartAt?: string;
  actualEndAt?: string;
  correctedBy: string;
  note: string;
};

export type LessonCorrectionPatch = Partial<
  Pick<
    Lesson,
    | "actualStartAt"
    | "actualEndAt"
    | "startCorrectedBy"
    | "startCorrectionNote"
    | "endCorrectedBy"
    | "endCorrectionNote"
  >
>;

/**
 * Yalnızca SCHOOL_ADMIN/SUPER_ADMIN çağırır (tool katmanında zorlanır) —
 * bu fonksiyon yalnızca "not olmadan düzeltme reddedilir" kuralını uygular.
 * En az bir zaman alanı (actualStartAt veya actualEndAt) verilmelidir.
 */
export function correctLessonTimes(
  correction: LessonTimeCorrection
): { ok: true; patch: LessonCorrectionPatch } | { ok: false; message: string } {
  if (!correction.note.trim()) {
    return { ok: false, message: "Düzeltme notu zorunludur." };
  }
  if (!correction.actualStartAt && !correction.actualEndAt) {
    return { ok: false, message: "actualStartAt veya actualEndAt gerekli." };
  }
  const patch: LessonCorrectionPatch = {};
  if (correction.actualStartAt) {
    patch.actualStartAt = correction.actualStartAt;
    patch.startCorrectedBy = correction.correctedBy;
    patch.startCorrectionNote = correction.note;
  }
  if (correction.actualEndAt) {
    patch.actualEndAt = correction.actualEndAt;
    patch.endCorrectedBy = correction.correctedBy;
    patch.endCorrectionNote = correction.note;
  }
  return { ok: true, patch };
}

export type LessonLiveUpdateResult =
  | { ok: true; data: AppData; lesson: Lesson }
  | { ok: false; message: string };

function findLesson(data: AppData, lessonId: string): Lesson | undefined {
  return data.lessons.find((l) => l.id === lessonId);
}

function applyLessonPatch(data: AppData, lessonId: string, patch: Partial<Lesson>): AppData {
  const lessons = data.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l));
  return { ...data, lessons };
}

export function applyStartLesson(
  data: AppData,
  lessonId: string,
  now: Date = new Date()
): LessonLiveUpdateResult {
  const lesson = findLesson(data, lessonId);
  if (!lesson) return { ok: false, message: "Ders bulunamadı." };
  const result = startLesson(lesson, now);
  if (!result.ok) return result;
  const nextData = applyLessonPatch(data, lessonId, result.patch);
  const nextLesson = findLesson(nextData, lessonId)!;
  return { ok: true, data: nextData, lesson: nextLesson };
}

export function applyEndLesson(
  data: AppData,
  lessonId: string,
  now: Date = new Date()
): LessonLiveUpdateResult {
  const lesson = findLesson(data, lessonId);
  if (!lesson) return { ok: false, message: "Ders bulunamadı." };
  const result = endLesson(lesson, now);
  if (!result.ok) return result;
  const nextData = applyLessonPatch(data, lessonId, result.patch);
  const nextLesson = findLesson(nextData, lessonId)!;
  return { ok: true, data: nextData, lesson: nextLesson };
}

export function applyCorrectLessonTimes(
  data: AppData,
  lessonId: string,
  correction: LessonTimeCorrection
): LessonLiveUpdateResult {
  const lesson = findLesson(data, lessonId);
  if (!lesson) return { ok: false, message: "Ders bulunamadı." };
  const result = correctLessonTimes(correction);
  if (!result.ok) return result;
  const nextData = applyLessonPatch(data, lessonId, result.patch);
  const nextLesson = findLesson(nextData, lessonId)!;
  return { ok: true, data: nextData, lesson: nextLesson };
}
