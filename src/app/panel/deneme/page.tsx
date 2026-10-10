import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { activeInstrumentOptions } from "@/lib/instrument-options";
import { listTrialLessonsTool } from "@/lib/services";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { TrialLessonCreateForm } from "@/components/trial-lesson-create-form";
import { TrialLessonsTable, type TrialRow } from "@/components/trial-lessons-table";
import { canRunCriticalActions } from "@/lib/critical-action-password";
import { readReferenceData } from "@/lib/store";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { DEFAULT_APP_TIMEZONE, isoToWallDateTimeInput, toZonedYmd } from "@/lib/timezone";
import { applicationInstruments, listTrialApplicationsTool } from "@/lib/trial-applications";
import { TrialApplicationsList } from "@/components/trial-applications-list";
import { CopyLink } from "@/components/recruitment/copy-link";
import { careerSlugForTenant } from "@/lib/recruitment/institution";

export const dynamic = "force-dynamic";

/**
 * Deneme dersleri — planlama + geçmiş/gelecek tüm kayıtlar. Her satırda
 * planlayan personel ve (varsa) kayda dönüşüm bilgisi: kim, ne zaman, hangi öğrenci.
 */
export default async function TrialLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{
    planlandi?: string;
    deneme?: string;
    /** 2026-10-05 — "basvurular" sekmesi; `planla` = "1" (boş form) veya başvuru id'si (ön dolu). */
    sekme?: string;
    planla?: string;
    zaman?: string;
    sube?: string;
    ogretmen?: string;
  }>;
}) {
  const { planlandi, deneme, sekme, planla, zaman, sube, ogretmen } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/deneme");
  }
  if (session.role === "STUDENT") redirect("/login");

  const data = await readReferenceData();
  const result = await listTrialLessonsTool(session);
  const trials = result.ok ? result.data.trials : [];
  // Kapsam hatası (ör. atanmış şubesi olmayan şube müdürü) sessizce boş
  // listeye gömülmüyor — kullanıcı NEDEN buton göremediğini anlar.
  const listError = result.ok ? null : result.error.message;

  const names = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: trials.flatMap((t) => [t.createdBy, t.convertedByUserId, t.resultNotesByUserId]),
    teachers: data.teachers,
  });
  const now = new Date().getTime();
  const rows: TrialRow[] = trials.map((t) => ({
    id: t.id,
    name: t.name,
    phone: t.phone,
    parentName: t.parentName,
    instrument: t.instrument,
    teacherId: t.teacherId,
    teacherName: data.teachers.find((x) => x.id === t.teacherId)?.name ?? "—",
    branchId: t.branchId,
    branchName: data.settings.branches.find((b) => b.id === t.branchId)?.shortName ?? "—",
    startAt: t.startAt,
    dayYmd: toZonedYmd(new Date(t.startAt), DEFAULT_APP_TIMEZONE),
    startLabel: formatDateTime(t.startAt),
    startLocal: isoToWallDateTimeInput(t.startAt),
    notes: t.notes,
    resultNotes: t.resultNotes,
    resultNotesLabel: t.resultNotesAt
      ? `Son güncelleme: ${names.get(t.resultNotesByUserId ?? "") ?? "Bilinmeyen kullanıcı"} · ${formatDateTime(t.resultNotesAt)}`
      : undefined,
    isStarted: new Date(t.startAt).getTime() <= now,
    // 11. tur iş #1 — süresi kayıtlarda olmayan çok eski denemelerde gerçek
    // uzunluk başlangıç-bitiş farkından türetilir; düzenleme formu mevcut
    // değeri "(mevcut kayıt)" olarak korur, sessiz süre değişimi olmaz.
    durationMinutes:
      t.durationMinutes ??
      Math.max(1, Math.round((new Date(t.endAt).getTime() - new Date(t.startAt).getTime()) / 60000)),
    status: t.status,
    createdByName: names.get(t.createdBy) ?? "Bilinmeyen kullanıcı",
    convertedStudentId: t.convertedStudentId,
    convertedStudentName: t.convertedStudentId ? data.students.find((s) => s.id === t.convertedStudentId)?.name : undefined,
    convertedByName: t.convertedByUserId ? names.get(t.convertedByUserId) : undefined,
    convertedAtLabel: t.convertedAt ? formatDateTime(t.convertedAt) : undefined,
    isPast: new Date(t.endAt).getTime() < now,
  }));

  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const instrumentOptions = await activeInstrumentOptions(session);
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName }));
  const converted = rows.filter((r) => r.convertedStudentId).length;
  const decided = rows.filter((r) => r.isPast && r.status !== "cancelled").length;
  // Şube müdürü revize eder + statü değiştirir; YENİ deneme planlamaz ve
  // kayda dönüştürmez (öğrenci kaydı ayrı yetki — fail-closed).
  const isBranchManager = session.role === "BRANCH_MANAGER";
  const canWriteTrial =
    session.role === "SUPER_ADMIN" ||
    session.role === "SCHOOL_ADMIN" ||
    session.role === "TEACHER" ||
    isBranchManager;

  // 2026-10-05 — Başvurular (yalnız kurum yöneticileri; tool kendi rol kapısını da uygular).
  const isAdmin = session.role === "SUPER_ADMIN" || session.role === "SCHOOL_ADMIN";
  const appsResult = isAdmin ? await listTrialApplicationsTool(session) : null;
  const applications = appsResult?.ok ? appsResult.data : [];
  const newCount = applications.filter((a) => a.status === "new").length;
  const tab = isAdmin && sekme === "basvurular" ? "basvurular" : "dersler";
  const tabHref = (t: "dersler" | "basvurular") => (t === "basvurular" ? "/panel/deneme?sekme=basvurular" : "/panel/deneme");
  const applySlug = isAdmin ? await careerSlugForTenant(session.tenantId) : "";
  const handlerNames = Object.fromEntries(
    (await resolveActorLabels({ tenantId: session.tenantId, userIds: applications.map((a) => a.handledByUserId), teachers: data.teachers })).entries()
  );

  // Planlama alt ekranı: ?planla=1 (boş) veya ?planla=<başvuru id> (ön dolu; ?zaman/&sube/&ogretmen seçilen tercih).
  const canPlan = !isBranchManager;
  const fromApp = planla && planla !== "1" ? applications.find((a) => a.id === planla) : undefined;
  const plannerOpen = canPlan && Boolean(planla) && (planla === "1" || Boolean(fromApp));
  // Yalnız yöneticinin SEÇTİĞİ alternatif ön doldurulur; genel "Planla"da saat boş gelir (otomatik randevu ima edilmez).
  const slot = fromApp && zaman ? fromApp.preferredSlots.find((x) => x.startAt === zaman) : undefined;
  const initial = fromApp
    ? {
        name: fromApp.name,
        phone: fromApp.phone,
        parentName: fromApp.parentName,
        instrument: fromApp.instrument,
        branchId: sube ?? slot?.branchId ?? fromApp.branchId,
        teacherId: ogretmen ?? slot?.teacherId,
        startLocal: (zaman ?? slot?.startAt) ? isoToWallDateTimeInput((zaman ?? slot!.startAt)!) : undefined,
        notes: [
          `Başvuru ${fromApp.applicationNo}`,
          fromApp.age ? `${fromApp.age} yaş` : "",
          applicationInstruments(fromApp).length > 1 ? `Enstrümanlar: ${applicationInstruments(fromApp).join(", ")}` : "",
          fromApp.note ? `Eğitim geçmişi: ${fromApp.note}` : "",
          fromApp.availabilityNote ? `Uygunluk: ${fromApp.availabilityNote}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deneme dersleri"
        description={`${rows.length} deneme · ${converted} kayda dönüştü${decided > 0 ? ` · dönüşüm oranı %${Math.round((converted / decided) * 100)}` : ""}`}
        actions={
          canPlan && !plannerOpen ? (
            <Link
              href={`${tabHref(tab)}${tab === "basvurular" ? "&" : "?"}planla=1`}
              className="rounded-md px-3 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--color-trial)" }}
            >
              + Deneme dersi planla
            </Link>
          ) : undefined
        }
      />

      {plannerOpen ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-trial)" }}>
              {fromApp ? `Başvurudan planla · ${fromApp.applicationNo} · ${fromApp.name}` : "Deneme dersi planla"}
            </p>
            <Link href={tabHref(tab)} className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Kapat ✕
            </Link>
          </div>
          <TrialLessonCreateForm
            key={planla}
            teachers={teachers}
            branches={branches}
            instrumentOptions={instrumentOptions}
            initial={initial}
            applicationId={fromApp?.id}
          />
        </Card>
      ) : null}

      {isAdmin ? (
        <nav className="flex gap-1 border-b border-[var(--color-border)]" aria-label="Deneme dersleri bölümleri">
          {(["dersler", "basvurular"] as const).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              aria-current={tab === t ? "page" : undefined}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
              style={
                tab === t
                  ? { borderColor: "var(--color-trial)", color: "var(--color-text)" }
                  : { borderColor: "transparent", color: "var(--color-text-muted)" }
              }
            >
              {t === "dersler" ? `Deneme dersleri (${rows.length})` : "Başvurular"}
              {t === "basvurular" && newCount > 0 ? (
                <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: "var(--color-trial)" }}>
                  {newCount} yeni
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}

      {tab === "basvurular" ? (
        <section className="space-y-4">
          <Card>
            <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Başvuru formu bağlantısı</p>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              Web sitenize, sosyal medyaya veya WhatsApp mesajına ekleyin. Aday enstrüman ve uygun zaman seçer; başvuru buraya düşer, size bildirim gelir.
            </p>
            <CopyLink path={`/basvuru/${applySlug}/deneme`} />
          </Card>
          {appsResult && !appsResult.ok ? (
            <Card>
              <p role="alert" className="text-sm font-medium" style={{ color: "var(--color-danger)" }}>
                {appsResult.error.message}
              </p>
            </Card>
          ) : (
            <TrialApplicationsList applications={applications} branches={branches} teachers={teachers} handlerNames={handlerNames} />
          )}
        </section>
      ) : (
        <>
          {listError ? (
            <Card>
              <p role="alert" className="text-sm font-medium" style={{ color: "var(--color-danger)" }}>
                {listError}
              </p>
            </Card>
          ) : null}
          <section>
            <TrialLessonsTable
              key={`${planlandi ?? "list"}:${deneme ?? ""}`}
              rows={rows}
              canWrite={canWriteTrial}
              canConvertTrial={!isBranchManager}
              canDelete={canWriteTrial && canRunCriticalActions(session.role)}
              isTeacher={session.role === "TEACHER"}
              teachers={teachers}
              branches={branches}
              instrumentOptions={instrumentOptions}
              initialPromptTrialId={planlandi}
              initialOpenTrialId={deneme}
            />
          </section>
        </>
      )}
      <Link href="/panel/program" className="text-sm font-medium text-[var(--color-primary)]">
        ← Ders programı
      </Link>
    </div>
  );
}
