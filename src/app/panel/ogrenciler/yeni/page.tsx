import { redirect } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Card, PageHeader } from "@/components/ui";
import { NewStudentForm } from "@/components/new-student-form";
import { isMembershipActive, listClubs, listClubMemberships } from "@/lib/clubs";
import { DEFAULT_APP_TIMEZONE as CLUB_TZ, toZonedYmd as clubYmd } from "@/lib/timezone";
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
  searchParams: Promise<{ deneme?: string }>;
}) {
  const { deneme } = await searchParams;
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

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-4">
        <BackButton fallbackHref="/panel/ogrenciler" label="Öğrencilere dön" />
      </div>
      <PageHeader title={trialPrefill ? "Deneme öğrencisini kayda dönüştür" : "Yeni Öğrenci Kaydı"} />
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
          branches={data.settings.branches.map((b) => ({ id: b.id, name: b.name }))}
          teachers={data.teachers.map((t) => ({
            id: t.id,
            name: t.name,
            active: t.active,
            instruments: t.instruments,
          }))}
          instrumentOptions={instrumentOptions}
          packages={(data.packages ?? [])
            .filter((p) => p.status === "active")
            .map((p) => ({
              id: p.id,
              title: p.title,
              price30Min: p.price30Min,
              price40Min: p.price40Min,
              price50Min: p.price50Min,
              defaultDurationMinutes: p.defaultDurationMinutes,
              defaultPaymentDueDay: p.defaultPaymentDueDay,
              monthlyLessonCount: p.monthlyLessonCount,
            }))}
          campaigns={(data.discountCampaigns ?? [])
            .filter((c) => c.active)
            .map((c) => ({
              id: c.id,
              name: c.name,
              displayId: c.displayId,
              discountPercent: c.discountPercent,
              stackingRule: c.stackingRule ?? "none",
              priority: c.priority ?? 0,
              branchId: c.branchId,
              applicableBranchIds: c.applicableBranchIds,
              validFrom: c.validFrom,
              validTo: c.validTo,
              active: c.active,
              maxUsageCount: c.maxUsageCount,
              usageCount: c.usageCount ?? 0,
              createdAt: c.createdAt,
            }))}
          kvkkText={kvkkText}
          workDayOverrides={data.closedDayOverrides ?? []}
          termWeeklyClosedDays={data.settings.termWeeklyClosedDays}
          prefill={trialPrefill}
          trialSummary={trial ? `${trial.name} · ${trial.instrument} · ${formatDateTime(trial.startAt)}` : undefined}
        />
      )}
    </div>
  );
}
