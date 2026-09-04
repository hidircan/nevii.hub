import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listStudentContractsTool } from "@/lib/services";
import { ContractPanel } from "@/components/contract-panel";
import { BackButton } from "@/components/back-button";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { isFormalContractDuration } from "@/lib/contracts";
import { actionGenerateKvkkNoticeDocument, actionGeneratePhotoVideoConsentDocument } from "@/lib/actions";
import { deriveLessonScheduleTextFromLessons } from "@/lib/lesson-schedule-text";

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
  const canManagePaymentProfile = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const isFormal = isFormalContractDuration(intendedDurationMonths);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref={`/panel/ogrenciler/${student.id}`} label="Öğrenci detayına dön" className="mb-3" />
      <PageHeader title="Sözleşme Merkezi" description={`${student.name} — sözleşmeler ve belgeler`} />

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
          prefill={
            isNewStudent
              ? {
                  programmeName: student.instruments[0] ?? "",
                  monthlyAmount: student.monthlyFee,
                  paymentMethod: student.paymentMethod,
                  enrollmentStartDate: student.enrollmentStartDate,
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
          <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">KVKK ve Fotoğraf/Video Belgeleri</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Kayıt sözleşmesinden AYRI, kaynağın kendi yapısına uygun iki belge — Madde 19/20.
          </p>
          <div className="flex flex-wrap gap-2">
            <form
              action={async () => {
                "use server";
                await actionGenerateKvkkNoticeDocument({ studentId: student.id });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              >
                KVKK Aydınlatma Metni Oluştur
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
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              >
                Fotoğraf/Video Açık Rıza Formu Oluştur
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Fotoğraf/Video formu, önceden bu öğrenci için kaydedilmiş bir izin kararı (sözleşme oluşturma ekranı) gerektirir.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
