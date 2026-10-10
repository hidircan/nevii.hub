import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONTRACT_DURATION_MONTHS,
  buildContractPrefill,
  clampDurationMonths,
  prefillFromContract,
} from "../contract-prefill";

/**
 * Regresyon (2026-09-16) — kullanıcı raporu: "hatalı sözleşmeyi iptal ettim,
 * aynı öğrenciye yeniden sözleşme açtığımda Ödeme Planını Önizle bölümü
 * tamamen boş geliyor". Kök neden: ön doldurma yalnız `?yeniKayit=1`
 * adresinde üretiliyordu; iptal sonrası öğrenci detayından girilince form boş
 * açılıyor, önizleme eksik alan guard'ına takılıyordu. Ön doldurma artık
 * sözleşme geçmişinden BAĞIMSIZ, öğrencinin kayıt verisinden türetilir.
 */
const student = {
  instruments: ["Piyano"],
  monthlyFee: 4950,
  paymentMethod: "cash",
  enrollmentStartDate: "2026-09-10",
  lessonStartDate: "2026-09-15",
  derivedPerLessonAmount: 1237,
};

const firstPayment = { paidAt: "2026-09-15", method: "cash", amount: 3712, paidAmount: 3712 };

describe("buildContractPrefill — iptal edilmiş sözleşme ön doldurmayı ENGELLEMEZ", () => {
  it("süre parametresi olmadan da tüm alanlar dolu gelir (boş önizleme kök nedeni)", () => {
    const prefill = buildContractPrefill({ student, registrationFirstPayment: firstPayment });
    expect(prefill.programmeName).toBe("Piyano");
    expect(prefill.monthlyAmount).toBe(4950);
    expect(prefill.paymentMethod).toBe("cash");
    // Sözleşme DERS başlangıcından başlar, kayıt tarihinden değil.
    expect(prefill.enrollmentStartDate).toBe("2026-09-15");
    expect(prefill.firstCollectionAt).toBe("2026-09-15");
    expect(prefill.firstCollectionAmount).toBe(3712);
    // Ders-başı motorunun sessizce kapanması ikinci hatanın kaynağıydı.
    expect(prefill.usePerLessonBilling).toBe(true);
  });

  it("iptal edilmiş son sözleşme yalnız SÜRE ipucudur — alanları boşaltmaz", () => {
    const prefill = buildContractPrefill({
      student,
      latestContract: { installmentCount: 10, programmeName: "Gitar", monthlyAmount: 1, paymentMethod: "transfer" },
      registrationFirstPayment: firstPayment,
    });
    expect(prefill.durationMonths).toBe(10);
    expect(prefill.monthlyAmount).toBe(4950); // kayıt verisi otoritedir
    expect(prefill.programmeName).toBe("Piyano");
  });

  it("süre sırası: adres parametresi → son sözleşme → varsayılan", () => {
    expect(buildContractPrefill({ student, requestedDurationMonths: "6" }).durationMonths).toBe(6);
    expect(
      buildContractPrefill({ student, requestedDurationMonths: "abc", latestContract: { installmentCount: 9 } })
        .durationMonths
    ).toBe(9);
    expect(buildContractPrefill({ student }).durationMonths).toBe(DEFAULT_CONTRACT_DURATION_MONTHS);
    // Aralık dışı değerler yok sayılır.
    expect(buildContractPrefill({ student, requestedDurationMonths: 13 }).durationMonths).toBe(
      DEFAULT_CONTRACT_DURATION_MONTHS
    );
  });

  it("kayıt anı tahsilatı yoksa alanlar undefined kalır — uydurma tarih/tutar YOK", () => {
    const prefill = buildContractPrefill({ student, registrationFirstPayment: null });
    expect(prefill.firstCollectionAt).toBeUndefined();
    expect(prefill.firstCollectionAmount).toBeUndefined();
    expect(prefill.firstCollectionMethod).toBeUndefined();
  });

  it("ders-başı fiyatlandırma kullanmayan (legacy) öğrencide motor kapalı kalır", () => {
    const prefill = buildContractPrefill({ student: { ...student, derivedPerLessonAmount: null } });
    expect(prefill.usePerLessonBilling).toBe(false);
  });

  it("clampDurationMonths yalnız 1-12 tam sayıyı kabul eder", () => {
    expect(clampDurationMonths("10")).toBe(10);
    expect(clampDurationMonths(0)).toBeNull();
    expect(clampDurationMonths(12.5)).toBeNull();
    expect(clampDurationMonths(undefined)).toBeNull();
  });
});

describe("prefillFromContract — geçmiş sözleşmeyi temel alarak yeniden oluşturma", () => {
  const base = buildContractPrefill({ student, registrationFirstPayment: firstPayment });

  it("sözleşmedeki girdiler forma taşınır, fiyatlandırma modeli kayıttan gelmeye devam eder", () => {
    const next = prefillFromContract(
      {
        programmeName: "Keman",
        monthlyAmount: 5200,
        paymentMethod: "transfer",
        enrollmentStartDate: "2026-10-01",
        installmentCount: 8,
      },
      base
    );
    expect(next.programmeName).toBe("Keman");
    expect(next.monthlyAmount).toBe(5200);
    expect(next.paymentMethod).toBe("transfer");
    // 2026-09-17 — başlangıç eski sözleşmeden değil kaydın DERS başlangıcından gelir
    // (eski sözleşmeler kayıt tarihini taşıyabilir); form alanı yine düzenlenebilir.
    expect(next.enrollmentStartDate).toBe(base.enrollmentStartDate);
    expect(next.durationMonths).toBe(8);
    expect(next.usePerLessonBilling).toBe(true);
    expect(next.firstCollectionAmount).toBe(3712);
  });

  it("sözleşmede eksik alanlar kayıt verisinden tamamlanır", () => {
    const next = prefillFromContract({ installmentCount: 99 }, base);
    expect(next.monthlyAmount).toBe(4950);
    expect(next.enrollmentStartDate).toBe("2026-09-15");
    expect(next.durationMonths).toBe(base.durationMonths); // 99 geçersiz → temel değer
  });
});
