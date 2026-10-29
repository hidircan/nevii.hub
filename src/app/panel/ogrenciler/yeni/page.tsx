import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Card, PageHeader } from "@/components/ui";
import { NewStudentForm } from "@/components/new-student-form";
import { isMembershipActive, listClubs, listClubMemberships } from "@/lib/clubs";
import { DEFAULT_APP_TIMEZONE as CLUB_TZ, toZonedYmd as clubYmd } from "@/lib/timezone";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { buildEnrollmentFormContext } from "@/lib/enrollment-form-context";
import { groupLessonFormOptions } from "@/lib/group-lessons";
import { activeInstrumentOptions } from "@/lib/instrument-options";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { getCurrentConsentTextVersionTool } from "@/lib/services";
import { getTrialLesson } from "@/lib/trial-lessons";
import { formatDateTime } from "@/lib/utils";
import Link from "@/components/link";

export const dynamic = "force-dynamic";

/**
 * Paket 7 — Yeni öğrenci kaydı, mevcut listeden AYRI, tam sayfa bir akış.
 * Alanlar öğrenci detay ekranıyla (StudentProfileEditor, StudentTermTypeEditor,
 * StudentPaymentProfileEditor) İŞ AÇISINDAN aynı bilgiyi kapsar — kayıttan
 * sonra zorunlu ek bilgi girmek için detay sayfasına gitmeye gerek kalmaz.
 * Veri modeli/validation (actionAddStudent, createStudentSchema) DEĞİŞMEDİ
 * — bu sadece formun kendi ekranı ve bölümlenmiş düzeni.
 */
export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ deneme?: string; kulupBasvuru?: string; grupDersi?: string }>;
}) {
  const { deneme, kulupBasvuru, grupDersi } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ogrenciler/yeni");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);
  const instrumentOptions = await activeInstrumentOptions(session);
  const kvkkTextResult = await getCurrentConsentTextVersionTool(session, { consentType: "kvkk_general" });
  const kvkkText = kvkkTextResult.ok ? kvkkTextResult.data.version : undefined;

  // H — deneme dersinden dönüşüm: yalnız tek kurum görünümünde ve henüz dönüşmemiş denemeden ön doldurulur.
  const trial =
    deneme && kurum.scope.mode === "single" ? await getTrialLesson(kurum.scope.tenantId, deneme) : null;
  const trialPrefill =
    trial && !trial.convertedStudentId
      ? {
          convertedFromTrialId: trial.id,
          name: trial.name,
          parentPhone: trial.phone,
          ...(trial.parentName ? { parentName: trial.parentName } : {}),
          instrument: trial.instrument,
          teacherId: trial.teacherId,
          branchId: trial.branchId,
          notes: `Deneme dersi: ${formatDateTime(trial.startAt)}${trial.notes ? ` — ${trial.notes}` : ""}`,
        }
      : undefined;

  // 2026-10-07 — grup dersi başvurusundan kayıt: aday bilgileriyle ön doldurma (yalnız kendi kurumunda, eklenmemiş başvuru).
  const clubApp =
    kulupBasvuru && kurum.scope.mode === "single" && kurum.scope.tenantId === session.tenantId
      ? await (async () => {
          const { getClubApplicationTool } = await import("@/lib/club-applications");
          const r = await getClubApplicationTool(session, { id: kulupBasvuru });
          return r.ok && r.data.application.status !== "added" ? r.data.application : null;
        })()
      : null;
  const clubAppPrefill = clubApp
    ? {
        clubApplicationId: clubApp.id,
        clubApplicationClubId: clubApp.clubId,
        registrationKind: "club_only",
        name: clubApp.participantName,
        ...(clubApp.parentName
          ? { accountResponsibility: "PARENT_MANAGED", parentName: clubApp.parentName, parentPhone: clubApp.phone }
          : { accountResponsibility: "SELF_MANAGED", phone: clubApp.phone }),
        ...(clubApp.email ? { email: clubApp.email } : {}),
        ...(clubApp.birthDate ? { birthDate: clubApp.birthDate } : {}),
        ...(clubApp.branchId ? { branchId: clubApp.branchId } : {}),
        notes: `Grup dersi başvurusu ${clubApp.reference} (${clubApp.clubSnapshot.name})${clubApp.note ? ` — Eğitim geçmişi: ${clubApp.note}` : ""}`.slice(0, 500),
      }
    : undefined;

  // 2026-10-05 — Kulüp seçimi yalnız kendi kurumunda (yazım oturumun kurumuna gider).
  const clubOptions =
    kurum.scope.mode === "single" && kurum.scope.tenantId === session.tenantId
      ? await (async () => {
          const [clubs, memberships] = await Promise.all([listClubs(session.tenantId), listClubMemberships(session.tenantId)]);
          const t = clubYmd(new Date(), CLUB_TZ);
          return clubs
            .filter((c) => c.active)
            .map((c) => ({
              id: c.id,
              name: c.name,
              instrument: c.instrument,
              monthlyFee: c.monthlyFee,
              maxMembers: c.maxMembers,
              activeMembers: memberships.filter((m) => m.clubId === c.id && isMembershipActive(m, t)).length,
            }));
        })()
      : [];

  // 2026-10-23 — grup dersi seçenekleri (yalnız kendi kurumunda; yazım oturumun kurumuna gider).
  const ownTenant = kurum.scope.mode === "single" && kurum.scope.tenantId === session.tenantId;
  const groupLessons = ownTenant ? await groupLessonFormOptions(session.tenantId, data.students) : [];
  const groupPrefill = grupDersi && groupLessons.some((g) => g.id === grupDersi) ? { groupLessonId: grupDersi } : undefined;

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-4">
        <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" />
      </div>
      <PageHeader title={clubAppPrefill ? "Grup dersi başvurusundan öğrenci kaydı" : trialPrefill ? "Deneme öğrencisini kayda dönüştür" : "Yeni Öğrenci Kaydı"} />
      {trial?.convertedStudentId ? (
        <Card className="mb-4">
          <p className="text-sm text-[var(--color-text)]">
            {trial.name} deneme kaydı zaten öğrenciye dönüştürülmüş.{" "}
            <Link href={`/panel/ogrenciler/${trial.convertedStudentId}`} className="font-medium text-[var(--color-primary)] hover:underline">
              Öğrenci kaydını aç →
            </Link>
          </p>
        </Card>
      ) : null}

      <Card className="mb-4 !border-cyan-200 !bg-cyan-50/70 dark:!border-cyan-900 dark:!bg-cyan-950/30">
        <p className="text-xs font-medium text-cyan-900 dark:text-cyan-200">
          Öğrenci kaydı tamamlandıktan sonra, öğrenci detay sayfasındaki{" "}
          <strong>&quot;Kayıt ve Ödeme Planı / Sözleşmeler&quot;</strong> bölümünden program, süre,
          taksit planı ve imzalayan bilgilerini girerek kayıt sözleşmesini ve yazdırılabilir PDF&apos;i
          oluşturabilirsiniz.
        </p>
      </Card>

      {kurum.scope.mode !== "single" ? (
        <Card>
          <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800">
            &quot;Tüm kurumlar&quot; görünümündesiniz — yeni öğrenci eklemek için üstteki kurum
            seçiciden tek bir kurum seçin.
          </p>
        </Card>
      ) : (
        <NewStudentForm
          clubs={clubOptions}
          enrollmentContext={buildEnrollmentFormContext(data, {
            instrumentOptions,
            personBranchId: data.settings.branches[0]?.id ?? "",
            todayYmd: toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE),
            groupLessons,
          })}
          kvkkText={kvkkText}
          prefill={clubAppPrefill ?? trialPrefill ?? groupPrefill}
          trialSummary={
            clubApp
              ? `${clubApp.reference} · ${clubApp.participantName} · ${clubApp.clubSnapshot.name}`
              : trial
                ? `${trial.name} · ${trial.instrument} · ${formatDateTime(trial.startAt)}`
                : undefined
          }
        />
      )}
    </div>
  );
}
