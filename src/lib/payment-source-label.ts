/**
 * 2026-10-23 — ÖDEME SATIRININ KAYNAĞI ve kullanıcıya görünen TEK adı (tek tablo `Payment`).
 *
 * Ad teknik alandan değil domain anlamından türer ve her ekranda aynıdır (Yoklama Takvimi, Ödemeler listesi,
 * Açık borçlar, öğrenci ödeme geçmişi, tahsil et penceresi). Eskiden aynı sözleşmesiz satır bir yerde
 * "Sözleşmesiz aylık plan", Ödemeler rozetinde "Aylık plan tahsilatı" görünüyordu; ödenmemiş borçta "tahsilatı"
 * yanıltıcıydı. Adlar ödenmiş/ödenmemiş satırda aynı kalır, bu yüzden "tahsilat"/"borç" gibi duruma bağlı kelime içermez.
 * - contract: sözleşmenin dondurulmuş taksidi (`contractId`)
 * - registration: kayıt anı ilk tahsilatı (sözleşmeye bağlanmamışsa)
 * - monthly_plan: sözleşmesiz öğrencinin aylık plan satırı (gece tahakkuku / Yoklama Takvimi)
 * - lesson: ders bazlı otomatik ücret (Geldi/İşlendi)
 * - manual: elle girilen bağımsız kayıt
 * Saf, bağımlılıksız — istemci bileşenleri de içe aktarır.
 */
export type DebtSourceKey = "contract" | "registration" | "monthly_plan" | "club" | "lesson" | "manual";

export const DEBT_SOURCE_LABEL: Record<DebtSourceKey, string> = {
  contract: "Sözleşme taksidi",
  registration: "Kayıt ilk tahsilatı",
  monthly_plan: "Sözleşmesiz aylık plan",
  club: "Kulüp ücreti",
  lesson: "Ders bazlı ücret",
  manual: "Elle girilen kayıt",
};

type SourceFields = { source?: string | null; contractId?: string | null; lessonId?: string | null };

export function debtSourceOf(p: SourceFields): DebtSourceKey {
  if (p.contractId || p.source === "contract") return "contract";
  if (p.source === "registration_first_payment") return "registration";
  if (p.source === "monthly_plan") return "monthly_plan";
  if (p.source === "club") return "club";
  if (p.source === "lesson_ops" || p.lessonId) return "lesson";
  return "manual";
}

/** Kullanıcıya görünen kaynak adı — tüm ekranlar bunu kullanır. */
export function paymentSourceLabel(p: SourceFields): string {
  return DEBT_SOURCE_LABEL[debtSourceOf(p)];
}
