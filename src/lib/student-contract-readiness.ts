/**
 * Öğrenci kaydının sözleşmeye hazır olması için gereken TÜRETİLMİŞ alanlar —
 * saf, I/O yok. CSV importu ve onarım scripti aynı kuralı kullanır.
 *
 * Yalnız aylık ücret / haftalık ders / telefonlardan HESAPLANABİLEN alanlar
 * doldurulur. İlk tahsilat, sözleşme, ödeme planı gibi finansal geçmiş ASLA
 * üretilmez; eksikse sözleşme adımında kullanıcıdan alınır.
 */
import { derivePerLessonAmount } from "./period-lesson-billing";

export type ContractReadinessStudent = {
  id: string;
  name: string;
  monthlyFee: number;
  weeklyLessonCount: number;
  parentPhone?: string;
  derivedPerLessonAmount?: number | null;
  accountResponsibility?: string | null;
  monthlyFeeManualOverride?: boolean | null;
};

export type ContractReadinessPatch = {
  derivedPerLessonAmount?: number;
  accountResponsibility?: "PARENT_MANAGED" | "SELF_MANAGED";
  monthlyFeeManualOverride?: boolean;
};

/** Boş alanlar için güvenli tamamlama; dolu alan asla ezilmez. Boş dönerse öğrenci zaten hazırdır. */
export function contractReadinessPatch(s: ContractReadinessStudent): ContractReadinessPatch {
  const patch: ContractReadinessPatch = {};
  if (s.derivedPerLessonAmount == null && s.monthlyFee > 0 && s.weeklyLessonCount > 0) {
    patch.derivedPerLessonAmount = derivePerLessonAmount(s.monthlyFee, s.weeklyLessonCount);
  }
  if (!s.accountResponsibility) {
    patch.accountResponsibility = s.parentPhone?.trim() ? "PARENT_MANAGED" : "SELF_MANAGED";
  }
  if (s.monthlyFeeManualOverride == null) patch.monthlyFeeManualOverride = false;
  return patch;
}
