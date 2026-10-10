/**
 * ÖNCELİK 4 (devam) — Paket Yönetimi + öğrenci ödeme profili. Saf hesap
 * fonksiyonları (store-agnostic, aynı desen `packages.ts`): öğrencinin
 * seçtiği paket + ders süresi + indirim + override'dan aylık beklenen
 * tutarı üretir. Yoklama Takvimi ay kutusu VE Ödemeler ekranı AYNI bu
 * fonksiyonu kullanır — tutarlılık burada garanti edilir.
 *
 * Payment.amount oluşturma anında donmuş bir tam sayıdır; bu modül asla
 * geçmiş Payment kayıtlarını okumaz/yazmaz, yalnızca "bundan sonraki"
 * varsayılan tutarı hesaplar.
 */

import type { DiscountType, LessonDurationPreference, Package, Student } from "./types";
import { priceForDuration } from "./packages";

export type StudentMonthlyAmount = {
  /** Paketin seçilen süre için liste fiyatı (indirim/override öncesi). Paket yoksa null. */
  listPrice: number | null;
  discountType?: DiscountType;
  discountValue?: number;
  /** İndirimin TL karşılığı (liste fiyatına uygulanan). */
  discountAmount: number;
  /** İndirim sonrası, override uygulanmadan önceki tutar. */
  discountedPrice: number | null;
  /** Yönetici override'ı set edilmişse bu tutar. */
  overrideAmount: number | null;
  /** Nihai aylık beklenen tutar: override varsa override, yoksa discountedPrice, o da yoksa null. */
  netAmount: number | null;
};

/**
 * İki sözlük aynı kolonda yaşar: kayıt/kampanya motoru "percent"/"amount" (packages.ts),
 * bu ekranın editörü "percentage"/"fixed" yazar. 2026-09-30 — "percent" burada TL sanılıyordu:
 * %100 kampanyalı öğrenci "₺100 indirim, net 6.900" görünüyordu (gerçek ücret 0).
 */
export function isPercentDiscount(discountType?: DiscountType): boolean {
  return discountType === "percent" || discountType === "percentage";
}

function computeDiscountAmount(basePrice: number, discountType?: DiscountType, discountValue?: number): number {
  if (!discountType || !discountValue || discountValue <= 0) return 0;
  if (isPercentDiscount(discountType)) {
    const pct = Math.min(discountValue, 100);
    return Math.round((basePrice * pct) / 100);
  }
  return Math.min(discountValue, basePrice);
}

/**
 * Öğrencinin aylık beklenen tutarını hesaplar. `pkg` bulunamazsa (silinmiş
 * referans değil, hard delete yok ama örn. cross-tenant/eksik veri) liste
 * fiyatı `null` döner — yalnızca override varsa yine de bir tutar üretilir.
 */
export function computeStudentMonthlyAmount(
  student: Pick<Student, "paymentAmount" | "discountType" | "discountValue">,
  pkg: Package | undefined,
  durationMinutes: LessonDurationPreference
): StudentMonthlyAmount {
  const listPrice = pkg ? priceForDuration(pkg, durationMinutes) : null;
  const discountAmount = listPrice !== null ? computeDiscountAmount(listPrice, student.discountType, student.discountValue) : 0;
  const discountedPrice = listPrice !== null ? listPrice - discountAmount : null;
  const overrideAmount = typeof student.paymentAmount === "number" ? student.paymentAmount : null;
  const netAmount = overrideAmount !== null ? overrideAmount : discountedPrice;

  return {
    listPrice,
    discountType: student.discountType,
    discountValue: student.discountValue,
    discountAmount,
    discountedPrice,
    overrideAmount,
    netAmount,
  };
}

export function validateDiscount(discountType: DiscountType | undefined, discountValue: number | undefined): string | null {
  if (discountType === undefined && discountValue === undefined) return null;
  if (discountType === undefined || discountValue === undefined) {
    return "İndirim türü ve değeri birlikte belirtilmeli.";
  }
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return "İndirim değeri negatif olamaz.";
  }
  if (isPercentDiscount(discountType) && discountValue > 100) {
    return "Yüzde indirim 100'ü geçemez.";
  }
  return null;
}

export function validatePaymentOverride(amount: number | undefined): string | null {
  if (amount === undefined) return null;
  if (!Number.isInteger(amount) || amount < 0) {
    return "Özel tutar (override) tam sayı (TL) ve negatif olmayan bir değer olmalı.";
  }
  return null;
}
