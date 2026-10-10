/**
 * 2026-09-19 — ders iptal kuralının TEK kaynağı. Sunucu (`applyLessonCancel`,
 * seri iptalleri) ve Ders Programı arayüzü (buton görünürlüğü + neden metni)
 * bu fonksiyonu çağırır; "UI gösterdi ama sunucu reddetti" (veya tersi)
 * tutarsızlığı böyle kapanır. Saf fonksiyon — istemci paketine güvenle girer.
 *
 * Veri koruma gerekçesi:
 * - İşlendi (`status: completed`): hakediş bu derse bağlı.
 * - Telafi işareti: telafi hakkı/talebi bu dersten doğdu; iptal onu sahipsiz bırakır.
 * - Telafi DERSİ (`type: makeup`): Telafi Merkezi'nin yönettiği kayıt.
 * Geldi/Gelmedi/Mazeretli işaretli, hâlâ "planlı" ders iptal edilebilir (mevcut davranış).
 */
import type { Lesson } from "./types";

export type LessonCancelInput = Pick<Lesson, "type" | "status" | "opsMakeupFlag" | "lessonProcessed">;

export function lessonCancelBlockReason(lesson: LessonCancelInput): string | null {
  if (lesson.status === "cancelled") return "Bu ders zaten iptal edilmiş.";
  if (lesson.type === "makeup") {
    return "Telafi dersleri Ders Programı'ndan iptal edilemez. Telafiyi Telafi Merkezi'nden iptal edin veya yeniden planlayın.";
  }
  if (lesson.type !== "regular") {
    return "Yalnız normal dersler buradan iptal edilebilir. Deneme/grup dersini kendi ekranından yönetin.";
  }
  if (lesson.lessonProcessed || lesson.status === "completed") {
    return "Bu ders \"İşlendi\" olarak kayıtlı; öğretmen hakedişi bu derse bağlı olduğu için iptal edilemez.";
  }
  if (lesson.opsMakeupFlag) {
    return "Bu ders için \"Telafi\" işaretlendi ve telafi hakkı doğdu; iptal edilemez. Yanlış işaretlendiyse Yoklama durumundan değiştirin.";
  }
  if (lesson.status === "in_progress") return "Ders şu an devam ediyor; iptal edilemez.";
  if (lesson.status === "no_show") return "Bu derste öğrenci \"gelmedi\" olarak sonuçlanmış; iptal edilemez.";
  return null;
}

export function canCancelLesson(lesson: LessonCancelInput): boolean {
  return lessonCancelBlockReason(lesson) === null;
}
