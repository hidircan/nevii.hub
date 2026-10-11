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

export type RegistrationBranchSummary = {
  enrollmentId: string;
  /** "Piyano · Ayşe Hoca" */
  label: string;
  packageLabel: string;
  monthlyFee: number;
  paymentMethod?: string;
  startDate?: string;
  durationMonths: number;
  /** Bu branşın kayıt anı ilk tahsilatı: tutar+yöntem+tarih; "none" = alınmadı; "waived" = burslu (0 ₺). */
  firstCollection: { kind: "paid"; amount: number; method?: string; date?: string } | { kind: "waived" } | { kind: "none" };
  hasContract: boolean;
};

const METHOD_LABEL: Record<string, string> = { cash: "Nakit", transfer: "Havale/EFT", credit_card: "Kredi kartı" };

/**
 * 2026-10-10 — çok branşlı kayıt: her branş AYRI özet satırıdır (paket/ücret/ödeme/süre/ilk tahsilat/sözleşme bağlantısı
 * o branşa özgü). Tek branşlı kayıtta görünüm eskisiyle aynıdır.
 */
export function RegistrationSuccessPanel({
  studentId,
  studentName,
  branches,
  inviteWarning,
}: {
  studentId: string;
  studentName: string;
  branches: RegistrationBranchSummary[];
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

  const multi = branches.length > 1;
  const missingCollection = branches.filter((b) => b.firstCollection.kind === "none");

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
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Öğrenci kaydı oluşturuldu; ancak tamamlanması gereken adımlar var.</p>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-300/80">{inviteWarning}</p>
          <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-300/70">
            Davet e-postasını öğrenci detay sayfasından (&quot;Portal Erişimi&quot; bölümü) tekrar gönderebilirsiniz.
          </p>
        </Card>
      ) : null}

      <Card className="mb-6 !border-emerald-200 !bg-emerald-50 !p-4 dark:!border-emerald-900 dark:!bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          Öğrenci kaydı başarıyla oluşturuldu{multi ? ` — ${branches.length} branş kaydı açıldı` : ""}.
        </p>
        <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-300">{studentName}</p>

        <div className="mt-3 space-y-3">
          {branches.map((b) => {
            const isFormal = b.durationMonths >= 3;
            const dueRule = describePaymentDueRule(b.paymentMethod);
            const contractHref = `/panel/ogrenciler/${studentId}/sozlesmeler?brans=${encodeURIComponent(b.enrollmentId)}&yeniKayit=1&sure=${b.durationMonths}`;
            return (
              <div key={b.enrollmentId} className="rounded-lg border border-emerald-300/70 bg-white/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{b.label}</p>
                <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-emerald-800/80 dark:text-emerald-300/80 sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium">Program: </dt>
                    <dd className="inline">{b.packageLabel}</dd>
                  </div>
                  {b.startDate ? (
                    <div>
                      <dt className="inline font-medium">Başlangıç: </dt>
                      <dd className="inline">{formatDateTr(b.startDate)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline font-medium">Ödeme yöntemi: </dt>
                    <dd className="inline">{paymentMethodLabel(b.paymentMethod)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Ödeme kuralı: </dt>
                    <dd className="inline">{dueRule.ruleText}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Planlanan süre: </dt>
                    <dd className="inline">{b.durationMonths} ay</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Tahmini toplam: </dt>
                    <dd className="inline">
                      {formatTL(b.monthlyFee * b.durationMonths)} ({formatTL(b.monthlyFee)} × {b.durationMonths} ay — kesin plan sözleşme adımında oluşturulur)
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium">İlk tahsilat: </dt>
                    <dd className="inline">
                      {b.firstCollection.kind === "paid"
                        ? `${formatTL(b.firstCollection.amount)}${b.firstCollection.method ? ` · ${METHOD_LABEL[b.firstCollection.method] ?? b.firstCollection.method}` : ""}${b.firstCollection.date ? ` · ${formatDateTr(b.firstCollection.date)}` : ""}`
                        : b.firstCollection.kind === "waived"
                          ? "Tahsilat yok (0 ₺ — burslu kayıt)"
                          : "Alınmadı — bu branşın sözleşmesindeki “İlk tahsilat” bölümünden girin"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-md border border-emerald-300 bg-emerald-100/60 px-2 py-1 font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                    {b.hasContract ? "Sözleşme oluşturuldu" : isFormal ? "Formal sözleşme oluşturulmaya hazır" : "Tanışma Paketi — Formal sözleşme gerekmiyor"}
                  </span>
                  <Link href={contractHref} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800">
                    {isFormal ? "Sözleşmeyi Gözden Geçir ve Oluştur" : "Ödeme Planını Görüntüle"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {missingCollection.length > 0 ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            İlk tahsilatı girilmemiş branş: {missingCollection.map((b) => b.label).join(", ")}.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
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
