import type { TrialLessonStatus } from "./types";

export const TRIAL_STATUS_LABELS: Record<TrialLessonStatus, string> = {
  planned: "Planlandı",
  attended: "Katıldı",
  considering: "Düşünüyor",
  awaiting_enrollment: "Kayıt bekleniyor",
  will_continue: "Devam edecek",
  will_not_continue: "Devam etmeyecek",
  cancelled: "İptal",
};

/** Bu statülere geçişte "kayda dönüştürülsün mü?" sorusu sorulur. */
export const TRIAL_CONVERSION_PROMPT_STATUSES: TrialLessonStatus[] = ["attended", "awaiting_enrollment", "will_continue"];

/** Yeni öğrenci kaydını denemeden ön doldurarak açan rota. */
export function trialConversionHref(trialId: string): string {
  return `/panel/ogrenciler/yeni?deneme=${encodeURIComponent(trialId)}`;
}
