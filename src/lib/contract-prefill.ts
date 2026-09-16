/**
 * Sözleşme formunun ÖN DOLDURMA kaynağı (2026-09-16 kök neden düzeltmesi).
 *
 * HATA: `sozlesmeler/page.tsx` ön doldurmayı YALNIZCA `?yeniKayit=1` ile
 * gelindiğinde üretiyordu. Kullanıcı hatalı bir sözleşmeyi iptal edip öğrenci
 * detayından tekrar Sözleşme Merkezi'ne girdiğinde adreste o parametre YOKTUR:
 * form bomboş açılıyor, "Ödeme Planını Önizle" eksik alan guard'ına takılıp
 * sessizce geri dönüyor (kullanıcının gördüğü BOŞ ÖNİZLEME) ve dahası
 * `usePerLessonBilling` false kaldığı için alanlar elle doldurulsa bile plan
 * ders-başı motoru yerine SABİT taksit motoruyla hesaplanıyordu.
 *
 * KURAL: ön doldurma sözleşme geçmişine DEĞİL, öğrencinin kendi kayıt
 * verisine (canonical) dayanır — iptal edilmiş/yenilenmiş sözleşmeler bu
 * üretimi ASLA engellemez, yalnızca "kullanıcının en son niyeti" (süre) için
 * ipucu verir. Saf fonksiyon: I/O yok, hem sunucu sayfası hem testler kullanır.
 */

export type ContractPrefillData = {
  programmeName?: string;
  monthlyAmount?: number;
  paymentMethod?: string;
  enrollmentStartDate?: string;
  firstCollectionAt?: string;
  firstCollectionMethod?: string;
  firstCollectionAmount?: number;
  durationMonths?: number;
  usePerLessonBilling?: boolean;
  lessonScheduleText?: string;
};

/** `sure` parametresi ve geçmiş sözleşme yoksa uygulanan süre. */
export const DEFAULT_CONTRACT_DURATION_MONTHS = 3;

/** 1-12 aralığında tam sayı mı? Değilse null (çağıran sıradaki kaynağa düşer). */
export function clampDurationMonths(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n;
}

type StudentLike = {
  instruments?: string[];
  monthlyFee: number;
  paymentMethod?: string;
  enrollmentStartDate?: string;
  lessonStartDate?: string;
  derivedPerLessonAmount?: number | null;
};

type FirstPaymentLike = {
  paidAt?: string;
  dueDate?: string;
  method?: string;
  amount: number;
  paidAmount?: number;
};

/** Süre için en son kullanıcı niyeti — İPTAL EDİLMİŞ sözleşme de sayılır (geçmiş, engel değil ipucudur). */
type ContractLike = {
  installmentCount?: number;
  programmeName?: string;
  monthlyAmount?: number;
  paymentMethod?: string;
  enrollmentStartDate?: string;
};

export function buildContractPrefill(input: {
  student: StudentLike;
  /** Listedeki EN SON sözleşme (iptal edilmiş olabilir) — yalnız süre ipucu için. */
  latestContract?: ContractLike | null;
  registrationFirstPayment?: FirstPaymentLike | null;
  /** Adresteki `sure` (kayıt akışından gelir); geçersizse yok sayılır. */
  requestedDurationMonths?: unknown;
  lessonScheduleText?: string;
}): ContractPrefillData {
  const { student, latestContract, registrationFirstPayment } = input;
  const durationMonths =
    clampDurationMonths(input.requestedDurationMonths) ??
    clampDurationMonths(latestContract?.installmentCount) ??
    DEFAULT_CONTRACT_DURATION_MONTHS;

  return {
    programmeName: student.instruments?.[0] ?? "",
    monthlyAmount: student.monthlyFee,
    paymentMethod: student.paymentMethod,
    // Sözleşmenin eğitim dönemi DERS başlangıcından başlar; kayıt tarihi ayrı alandır.
    enrollmentStartDate: student.lessonStartDate ?? student.enrollmentStartDate,
    firstCollectionAt: registrationFirstPayment?.paidAt ?? registrationFirstPayment?.dueDate,
    firstCollectionMethod: registrationFirstPayment?.method,
    firstCollectionAmount: registrationFirstPayment
      ? registrationFirstPayment.paidAmount || registrationFirstPayment.amount
      : undefined,
    durationMonths,
    usePerLessonBilling: student.derivedPerLessonAmount != null,
    lessonScheduleText: input.lessonScheduleText,
  };
}

/**
 * "Bunu temel alarak yeniden oluştur" — iptal edilmiş (ya da başka bir geçmiş)
 * sözleşmenin girdilerini yeni forma taşır. Fiyatlandırma MODELİ (ders-başı mı)
 * her zaman öğrencinin kaydından gelir; sözleşme satırı yalnız kullanıcının o
 * sözleşmede girdiği değerleri (program, ücret, süre, yöntem, başlangıç) verir.
 */
export function prefillFromContract(contract: ContractLike, base: ContractPrefillData): ContractPrefillData {
  return {
    ...base,
    programmeName: contract.programmeName || base.programmeName,
    monthlyAmount: contract.monthlyAmount ?? base.monthlyAmount,
    paymentMethod: contract.paymentMethod ?? base.paymentMethod,
    enrollmentStartDate: contract.enrollmentStartDate ?? base.enrollmentStartDate,
    durationMonths: clampDurationMonths(contract.installmentCount) ?? base.durationMonths,
  };
}
