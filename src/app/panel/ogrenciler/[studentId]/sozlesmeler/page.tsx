import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listStudentContractsTool } from "@/lib/services";
import { ContractPanel, type RegistrationSummary } from "@/components/contract-panel";
import { paymentMethodLabelTr } from "@/lib/utils";
import { BackButton } from "@/components/back-button";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { isFormalContractDuration } from "@/lib/contracts";
import {
  actionGenerateKvkkNoticeDocument,
  actionGeneratePhotoVideoConsentDocument,
  actionGenerateKvkkAndPhotoVideoConsentDocuments,
} from "@/lib/actions";
import { deriveLessonScheduleTextFromLessons } from "@/lib/lesson-schedule-text";
import { diagnoseContractAnnexTemplates } from "@/lib/contract-annexes";
import { listTemplates } from "@/lib/documents";
import { ContractAnnexTemplateNotice } from "@/components/contract-annex-template-notice";

/**
 * FAZ (2026-2027 SÖZLEŞME KAYNAĞI) — Bağımsız Sözleşme Merkezi. Önceden
 * `[studentId]/page.tsx` içine gömülü, yalnızca `#sozlesme` çapa-kaydırması
 * ile erişilen bir bölümdü (bkz. docs/contracts/2026_2027_OFFICIAL_CONTRACT_FULL_AUDIT.md
 * "K. UI/UX gereksinimi"). Bu sayfa AYNI `ContractPanel` bileşenini yeniden
 * kullanır — yeni bir paralel sözleşme UI'ı İCAT EDİLMEDİ, yalnızca kendi
 * URL'i/H1'i/erişilebilir odak noktası olan BAĞIMSIZ bir rota haline
 * getirildi (bkz. docs/contracts/INDEPENDENT_CONTRACT_CENTER_IMPLEMENTATION_REPORT.md).
 */
export default async function StudentContractsCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ yeniKayit?: string; sure?: string; davetUyari?: string }>;
}) {
  const { studentId } = await params;
  const { yeniKayit, sure, davetUyari } = await searchParams;
  const isNewStudent = yeniKayit === "1";
  const rawIntendedDuration = Number(sure);
  const intendedDurationMonths =
    Number.isInteger(rawIntendedDuration) && rawIntendedDuration >= 1 && rawIntendedDuration <= 12 ? rawIntendedDuration : 3;

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/ogrenciler/${studentId}/sozlesmeler`);
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const student = data.students.find((s) => s.id === studentId);

  if (!student) {
    return (
      <div>
        <PageHeader title="Öğrenci bulunamadı" />
        <EmptyState
          title="Öğrenci bulunamadı"
          description="Bu kayıt mevcut kurum/şube kapsamınızda değil veya kaldırılmış olabilir."
        />
        <Link href="/panel/ogrenciler" className="mt-4 inline-block text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          ← Öğrencilere dön
        </Link>
      </div>
    );
  }

  const contractsResult = await listStudentContractsTool(session, { studentId: student.id });
  const contracts = contractsResult.ok ? contractsResult.data.contracts : [];
  // P0 revizyonu — kayıtta GERÇEKTEN alınmış ilk tahsilatın kaydı: sözleşme
  // önizlemesindeki "İlk Tahsilat Tarihi"/"Ödeme Türü" bu kaynaktan beslenir.
  // Yoksa prefill boş kalır, önizleme "Henüz tahsil edilmedi" gösterir —
  // ders başlangıç tarihi asla tahsilat tarihi gibi yazılmaz.
  const registrationFirstPayment = data.payments.find(
    (p) => p.studentId === student.id && p.source === "registration_first_payment"
  );
  const selfManaged = student.accountResponsibility === "SELF_MANAGED";
  const registration: RegistrationSummary = {
    registeredAt: student.enrollmentStartDate,
    contractStartDay: (student.lessonStartDate ?? student.enrollmentStartDate)?.slice(0, 10),
    intendedDurationMonths: isNewStudent ? intendedDurationMonths : undefined,
    monthlyFee: student.monthlyFee,
    paymentMethod: student.paymentMethod,
    paymentMethodLabel: paymentMethodLabelTr(student.paymentMethod),
    firstPayment: registrationFirstPayment
      ? {
          paymentId: registrationFirstPayment.id,
          amount: registrationFirstPayment.amount,
          paidAt: registrationFirstPayment.paidAt ?? registrationFirstPayment.dueDate,
          method: registrationFirstPayment.method,
          methodLabel: paymentMethodLabelTr(registrationFirstPayment.method),
        }
      : undefined,
    firstCollectionIncludesNextMonth: registrationFirstPayment?.firstCollectionIncludesNextMonth,
    signatoryName: selfManaged ? student.name : student.parentName,
    signatoryRelationship: selfManaged ? "öğrenci" : "veli",
    address: student.address,
  };
  const canManagePaymentProfile = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const isFormal = isFormalContractDuration(intendedDurationMonths);
  // P0 (2026-09-05) — birleşik çıktının EK bölümlerini besleyen şablonlar
  // eksik/stub ise yöneticiye AÇIKÇA söylenir (sessizce zayıf belge üretilmez).
  const annexDiagnostics = canManagePaymentProfile
    ? diagnoseContractAnnexTemplates(await listTemplates(session.tenantId))
    : [];

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref={`/panel/ogrenciler/${student.id}`} label="Öğrenci detayına dön" className="mb-3" />
      <PageHeader title="Sözleşme Merkezi" description={`${student.name} — sözleşmeler ve belgeler`} />

      {/*
        P0 (2026-09-05) — sözleşme adımına gelen kullanıcı kayıt bilgilerinde
        bir hata görürse TARAYICI GERİ TUŞUNA muhtaç kalmamalı. Bu görünür
        aksiyon, kayıt bölümünü doğrudan düzenleme modunda açar ve süreyi
        (`sure`) taşır; öğrenci verisi zaten kaydedilmiş olduğundan hiçbir
        alan kaybolmaz, dönüşte bu sayfa (force-dynamic) TAZE veriyle yeniden
        render edilir — bayat önizleme/tahsilat hesabı kalmaz.
      */}
      <ContractAnnexTemplateNotice diagnostics={annexDiagnostics} />

      {canManagePaymentProfile ? (
        <Link
          href={`/panel/ogrenciler/${student.id}?duzenle=kayit&sozlesmeSure=${intendedDurationMonths}#genel`}
          className="mb-4 inline-flex w-full items-center justify-center rounded-lg border-2 border-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white sm:w-auto"
        >
          ← Öğrenci Kaydını Düzenle
        </Link>
      ) : null}

      {isNewStudent && davetUyari ? (
        <Card className="mb-4 !border-amber-300 !bg-amber-50 !p-4 dark:!border-amber-900 dark:!bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Öğrenci kaydı oluşturuldu ancak davet e-postası gönderilemedi.
          </p>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-300/80">{davetUyari}</p>
          <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-300/70">
            Daveti öğrenci detay sayfasından (&quot;Portal Erişimi&quot; bölümü) tekrar gönderebilirsiniz.
          </p>
        </Card>
      ) : null}

      {isNewStudent ? (
        <Card className="mb-4 !border-emerald-200 !bg-emerald-50 !p-4 dark:!border-emerald-900 dark:!bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {isFormal ? "Formal sözleşme oluşturulmaya hazır" : "Tanışma Paketi — Formal sözleşme gerekmiyor"}
          </p>
        </Card>
      ) : null}

      {!canManagePaymentProfile && contracts.length === 0 ? (
        <EmptyState title="Sözleşme bulunamadı" description="Bu öğrenci için henüz bir sözleşme kaydı oluşturulmamış." />
      ) : (
        <ContractPanel
          studentId={student.id}
          contracts={contracts}
          canManage={canManagePaymentProfile}
          autoOpenInitial={isNewStudent && isFormal}
          registration={registration}
          prefill={
            isNewStudent
              ? {
                  programmeName: student.instruments[0] ?? "",
                  monthlyAmount: student.monthlyFee,
                  paymentMethod: student.paymentMethod,
                  // P0 (2026-09-05) — sözleşmenin EĞİTİM dönemi ders başlangıcından
                  // başlar; kayıt tarihi ayrı bir alandır (bkz. resolveLessonStartDay).
                  enrollmentStartDate: student.lessonStartDate ?? student.enrollmentStartDate,
                  firstCollectionAt: registrationFirstPayment?.paidAt,
                  firstCollectionMethod: registrationFirstPayment?.method,
                  firstCollectionAmount: registrationFirstPayment
                    ? (registrationFirstPayment.paidAmount || registrationFirstPayment.amount)
                    : undefined,
                  durationMonths: intendedDurationMonths,
                  usePerLessonBilling: student.derivedPerLessonAmount != null,
                  lessonScheduleText: deriveLessonScheduleTextFromLessons(
                    data.lessons.filter((l) => l.studentId === student.id)
                  ),
                }
              : undefined
          }
        />
      )}

      {canManagePaymentProfile ? (
        <Card className="mt-4 !p-4">
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">KVKK ve Fotoğraf/Video Belgeleri — ayrı arşiv nüshası</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            <strong>Normal akışta buna gerek yoktur:</strong> sözleşmeyi &quot;Görüntüle / Yazdır&quot; ile açtığınızda
            KVKK ve Fotoğraf/Video bölümleri sözleşmenin ARDINA, bu sırayla, TEK çıktı olarak zaten eklenir. Bu bölüm
            yalnızca aynı iki metnin kendi referans numaralı, ayrı arşiv belgesi olarak üretilmesi gerektiğinde
            kullanılır (kaynağın Madde 19/20 yapısı).
          </p>
          <div className="flex flex-wrap gap-2">
            <form
              action={async () => {
                "use server";
                await actionGenerateKvkkAndPhotoVideoConsentDocuments({ studentId: student.id });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              >
                KVKK ve Fotoğraf/Video Belgesi Oluştur
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Fotoğraf/Video bölümü, önceden bu öğrenci için kaydedilmiş bir izin kararı (sözleşme oluşturma ekranı)
            gerektirir — kaydedilmemişse hiçbir belge oluşturulmaz, önce sözleşme ekranından izni kaydedin.
          </p>
          <details className="mt-3 text-xs text-[var(--color-text-muted)]">
            <summary className="cursor-pointer select-none font-medium">
              Yalnızca birini yeniden yazdırmam gerekiyor
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <form
                action={async () => {
                  "use server";
                  await actionGenerateKvkkNoticeDocument({ studentId: student.id });
                }}
              >
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                >
                  Yalnız KVKK Aydınlatma Metni
                </button>
              </form>
              <form
                action={async () => {
                  "use server";
                  await actionGeneratePhotoVideoConsentDocument({ studentId: student.id });
                }}
              >
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                >
                  Yalnız Fotoğraf/Video Açık Rıza Formu
                </button>
              </form>
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}
