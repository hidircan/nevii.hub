import type { TrialLessonStatus } from "./types";

export const TRIAL_STATUS_LABELS: Record<TrialLessonStatus, string> = {
  planned: "Planlandı",
  attended: "Katıldı",
  considering: "Düşünüyor",
  awaiting_enrollment: "Kayıt bekleniyor",
  // Saklanan değerler (will_continue / will_not_continue) aynen kalır; yalnız görünen ad değişti (2026-09-29).
  will_continue: "Tekrar planlanacak",
  will_not_continue: "Kayıt olmayacak",
  cancelled: "İptal",
};

/** Bu statülere geçişte "kayda dönüştürülsün mü?" sorusu sorulur. */
export const TRIAL_CONVERSION_PROMPT_STATUSES: TrialLessonStatus[] = ["attended", "awaiting_enrollment"];

/** Görünen statü: kayda dönüşen deneme (DB'de will_continue) "Kayda dönüştü" okunur, "Tekrar planlanacak" değil. */
export function trialStatusLabel(t: { status: TrialLessonStatus; convertedStudentId?: string | null }): string {
  if (t.convertedStudentId) return "Kayda dönüştü";
  return TRIAL_STATUS_LABELS[t.status] ?? t.status;
}

/** Yeni öğrenci kaydını denemeden ön doldurarak açan rota. */
export function trialConversionHref(trialId: string): string {
  return `/panel/ogrenciler/yeni?deneme=${encodeURIComponent(trialId)}`;
}
