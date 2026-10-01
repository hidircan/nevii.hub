"use client";

/**
 * Faz 3/4 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — kayıt başarı deneyimi:
 * (1) erişilebilir, GEÇİCİ bir "toast" (role=status, birkaç saniye sonra
 * kendiliğinden kapanır) VE (2) SUNUCU TARAFINDA ONAYLANMIŞ bir kayıttan
 * sonra render edilen KALICI bir özet paneli — yalnızca geçici bir popup'a
 * güvenilmez, sayfa yenilense/geri gelinse bile (server component zaten
 * `?yeniKayit=1` render ediyor) özet KALICI olarak görünür.
 *
 * Süre bilgisi (`intendedDurationMonths`) `Student` kaydına hiç YAZILMADI —
 * yalnızca redirect query'sinden geldi (bkz. src/lib/actions.ts
 * actionAddStudent) — bu yüzden sınıflandırma KESİN değil, GÖSTERGE
 * niteliğindedir; gerçek trial/formal ayrımı sözleşme oluşturulurken
 * (durationMonths alanı) KESİNLEŞİR.
 */

import { useEffect, useState } from "react";
import Link from "@/components/link";
import { Card } from "@/components/ui";
import { describePaymentDueRule, paymentMethodLabel } from "@/lib/payment-due-rule-client";
import { formatDateTr } from "@/lib/timezone";

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR").format(n) + " ₺";
}

export function RegistrationSuccessPanel({
  studentId,
  studentName,
  packageLabel,
  monthlyFee,
  paymentMethod,
  enrollmentStartDate,
  intendedDurationMonths,
  inviteWarning,
}: {
  studentId: string;
  studentName: string;
  packageLabel: string;
  monthlyFee: number;
  paymentMethod?: string;
  enrollmentStartDate?: string;
  intendedDurationMonths: number;
  /** Hata düzeltmesi (2026-08-31) — kayıt sırasında "davet e-postası gönder"
   * işaretliyken gönderim başarısız olduysa (SMTP yapılandırılmamış, rate
   * limit, sunucu hatası) admin'e görünür bir uyarı; boşsa hiçbir şey
   * göstermez (davet hiç istenmediyse veya başarılı gönderildiyse). */
  inviteWarning?: string;
}) {
  const [showToast, setShowToast] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowToast(false), 6000);
    return () => clearTimeout(t);
  }, []);

  const isFormal = intendedDurationMonths >= 3;
  const dueRule = describePaymentDueRule(paymentMethod);
  const estimatedTotal = monthlyFee * intendedDurationMonths;

  return (
    <>
      {showToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 rounded-lg border border-emerald-300 bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          Öğrenci kaydı başarıyla oluşturuldu.
        </div>
      ) : null}

      {inviteWarning ? (
        <Card className="mb-4 !border-amber-300 !bg-amber-50 !p-4 dark:!border-amber-900 dark:!bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Öğrenci kaydı oluşturuldu ancak davet e-postası gönderilemedi.
          </p>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-300/80">{inviteWarning}</p>
          <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-300/70">
            Daveti öğrenci detay sayfasından (&quot;Portal Erişimi&quot; bölümü) tekrar gönderebilirsiniz.
          </p>
        </Card>
      ) : null}

      <Card className="mb-6 !border-emerald-200 !bg-emerald-50 !p-4 dark:!border-emerald-900 dark:!bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Öğrenci kaydı başarıyla oluşturuldu.</p>
        <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-300">{studentName}</p>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-emerald-800/80 dark:text-emerald-300/80 sm:grid-cols-2">
          <div>
            <dt className="inline font-medium">Program: </dt>
            <dd className="inline">{packageLabel}</dd>
          </div>
          {enrollmentStartDate ? (
            <div>
              <dt className="inline font-medium">Başlangıç: </dt>
              <dd className="inline">{formatDateTr(enrollmentStartDate)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline font-medium">Ödeme yöntemi: </dt>
            <dd className="inline">{paymentMethodLabel(paymentMethod)}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Ödeme kuralı: </dt>
            <dd className="inline">{dueRule.ruleText}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Planlanan süre: </dt>
            <dd className="inline">{intendedDurationMonths} ay</dd>
          </div>
          <div>
            <dt className="inline font-medium">Tahmini toplam: </dt>
            <dd className="inline">
              {formatTL(estimatedTotal)} ({formatTL(monthlyFee)} × {intendedDurationMonths} ay — kesin plan sözleşme
              adımında oluşturulur)
            </dd>
          </div>
        </dl>

        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-100/60 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {isFormal ? "Formal sözleşme oluşturulmaya hazır" : "Tanışma Paketi — Formal sözleşme gerekmiyor"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {isFormal ? (
            <Link
              href={`/panel/ogrenciler/${studentId}/sozlesmeler?yeniKayit=1&sure=${intendedDurationMonths}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800"
            >
              Sözleşmeyi Gözden Geçir ve Oluştur
            </Link>
          ) : (
            <Link
              href={`/panel/ogrenciler/${studentId}/sozlesmeler?yeniKayit=1&sure=${intendedDurationMonths}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800"
            >
              Ödeme Planını Görüntüle
            </Link>
          )}
          <Link href={`/panel/ogrenciler/${studentId}`} className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
            Öğrenci Detayına Git
          </Link>
          <Link href="/panel/ogrenciler/yeni" className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
            Yeni Kayıt Oluştur
          </Link>
        </div>
      </Card>
    </>
  );
}
