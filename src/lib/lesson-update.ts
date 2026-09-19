import { differenceInMinutes, parseISO } from "date-fns";
import type { AppData, Lesson } from "./types";
import { validateLessonSlot, type SlotValidationCode } from "./makeup-engine";
import { isWeeklyClosedDayForTerm } from "./attendance-calendar";
import { lessonCancelBlockReason } from "./lesson-cancel-rules";

export type LessonUpdateErrorCode =
  | SlotValidationCode
  | "LESSON_NOT_FOUND"
  | "LESSON_NOT_EDITABLE"
  | "CLOSED_DAY";

export type LessonUpdateResult =
  | { ok: true; data: AppData; lesson: Lesson }
  | { ok: false; code: LessonUpdateErrorCode; message: string };

function findEditableLesson(
  data: AppData,
  lessonId: string
): { ok: true; lesson: Lesson } | { ok: false; code: LessonUpdateErrorCode; message: string } {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };
  }
  if (lesson.type !== "regular") {
    return {
      ok: false,
      code: "LESSON_NOT_EDITABLE",
      message: "Yalnızca normal dersler taşınabilir, süresi değiştirilebilir veya iptal edilebilir.",
    };
  }
  if (lesson.status !== "scheduled") {
    return {
      ok: false,
      code: "LESSON_NOT_EDITABLE",
      message: "Bu ders zaten tamamlanmış veya iptal edilmiş.",
    };
  }
  return { ok: true, lesson };
}

/**
 * Ders taşıma (startAt değişir, süre korunur) ve süre değiştirme (startAt aynı
 * kalır, süre değişir) için TEK ortak yol. Her iki durumda da nihai kararı
 * `validateLessonSlot` verir — çakışma/uygunluk/çalışma saati kuralları burada
 * tekrar yazılmaz. Sürükle-bırak, resize ve gelecekteki manuel "dersi taşı"
 * formu bu fonksiyonu paylaşır.
 */
export function applyLessonScheduleUpdate(
  data: AppData,
  input: { lessonId: string; startAt?: string; durationMinutes?: number },
  now: Date = new Date()
): LessonUpdateResult {
  const found = findEditableLesson(data, input.lessonId);
  if (!found.ok) return found;
  const { lesson } = found;

  const currentStart = parseISO(lesson.startAt);
  if (currentStart.getTime() <= now.getTime()) {
    return {
      ok: false,
      code: "LESSON_NOT_EDITABLE",
      message: "Geçmiş bir ders taşınamaz veya süresi değiştirilemez.",
    };
  }

  /**
   * P0 performans (2026-09-07) — kapalı gün kuralı eskiden YALNIZCA
   * `updateLessonScheduleTool` içinde, kendi `readData()` çağrısıyla
   * uygulanıyordu. Kural buraya taşındı: (1) taşıma yolundan bir tam-tenant
   * okuması eksilir, (2) kural artık store'un HANGİ yolundan gelinirse
   * gelinsin uygulanır (tool, ajan, gelecekteki manuel form) — daha önce
   * yalnız tek çağıranı koruyordu. Mesajlar bilinçli olarak DEĞİŞMEDİ.
   */
  if (input.startAt && isWeeklyClosedDayForTerm(parseISO(input.startAt), lesson.term, data.settings.termWeeklyClosedDays)) {
    return {
      ok: false,
      code: "CLOSED_DAY",
      message: lesson.term
        ? `${lesson.term === "yaz" ? "Cumartesi/Pazar" : "Pazartesi"} bu dönemde okul kapalıdır — ders bu güne taşınamaz.`
        : "Pazartesi okul kapalıdır — ders bu güne taşınamaz.",
    };
  }

  const currentDuration = differenceInMinutes(parseISO(lesson.endAt), currentStart);
  const newStartAt = input.startAt ?? lesson.startAt;
  const newDuration = input.durationMinutes ?? currentDuration;

  const validation = validateLessonSlot(
    data,
    { instrument: lesson.instrument, studentId: lesson.studentId },
    { teacherId: lesson.teacherId, roomId: lesson.roomId, startAt: newStartAt },
    { excludeLessonId: lesson.id, now, durationMinutes: newDuration }
  );
  if (!validation.ok) {
    return { ok: false, code: validation.code, message: validation.message };
  }

  const updatedLesson: Lesson = {
    ...lesson,
    startAt: validation.slot.startAt,
    endAt: validation.slot.endAt,
  };
  const lessons = data.lessons.map((l) => (l.id === lesson.id ? updatedLesson : l));
  return { ok: true, data: { ...data, lessons }, lesson: updatedLesson };
}

/**
 * ÖNCELİK 3 — bir ders iptal edildiğinde, o dersin (Geldi işaretlenmişse
 * ama henüz İşlendi'ye geçip "completed"e düşmediği için hâlâ iptal
 * edilebilir durumdaki) otomatik ders ücreti varsa ve HENÜZ ÖDENMEMİŞSE
 * (paidAmount henüz sıfırsa; kısmi/hiç ödeme yoksa) "voided" olarak
 * işaretlenir — asılı, artık geçersiz bir borç olarak kalmaz. Zaten
 * ödenmiş bir tahsilat asla otomatik geri alınmaz (gerçek para hareketi
 * var — bu yalnızca manuel/yönetici müdahalesiyle ele alınır).
 */
export function applyLessonCancel(data: AppData, lessonId: string): LessonUpdateResult {
  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return { ok: false, code: "LESSON_NOT_FOUND", message: "Ders bulunamadı." };
  // Tek kural — Ders Programı butonu da aynı fonksiyonla gösterilir/gizlenir.
  const blocked = lessonCancelBlockReason(lesson);
  if (blocked) return { ok: false, code: "LESSON_NOT_EDITABLE", message: blocked };

  const updatedLesson: Lesson = { ...lesson, status: "cancelled" };
  const lessons = data.lessons.map((l) => (l.id === lesson.id ? updatedLesson : l));
  const payments = data.payments.map((p) =>
    p.lessonId === lessonId && p.source === "lesson_ops" && p.status !== "paid" && p.status !== "voided" && p.paidAmount === 0
      ? { ...p, status: "voided" as const }
      : p
  );
  return { ok: true, data: { ...data, lessons, payments }, lesson: updatedLesson };
}

/**
 * P0 performans (2026-09-07) — store katmanının ders taşıma/süre güncelleme
 * sonucu. Bilinçli olarak tam `AppData` DÖNMEZ: eski sözleşme, yazmadan sonra
 * tenant'ın tamamını yeniden okumayı ZORUNLU kılıyordu (ölçüm: tek taşımada
 * 14 gereksiz sorgu). Çağıranın ihtiyacı olan tek şey güncellenmiş ders ve
 * bildirim için önceki başlangıç saatidir.
 */
export type LessonScheduleUpdateOutcome =
  | { ok: true; lesson: Lesson; previousStartAt: string }
  | { ok: false; code: LessonUpdateErrorCode; message: string };
