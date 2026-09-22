import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { resolveSafeReturnTo } from "@/lib/safe-return-to";
import { WeekDatePicker } from "@/components/week-date-picker";
import { ProgramStudio, type ProgramTrial } from "@/components/program-studio";
import { listTrialLessons } from "@/lib/trial-lessons";
import { ProgramTermYearNav, type ProgramTerm } from "@/components/program-term-year-nav";
import { currentAcademicAnchorYear } from "@/lib/attendance-calendar";
import { resolveWorkDay, type WorkDayResolution } from "@/lib/work-days";
import { addDays, startOfWeek } from "@/lib/utils";
import { format, isSameDay, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { AssistantPageContext } from "@/components/ai/assistant-page-context";
import { listInstrumentCatalogTool } from "@/lib/services";

export const dynamic = "force-dynamic";

const WEEK_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolveWeekStart(weekParam?: string): Date {
  if (weekParam && WEEK_PARAM_PATTERN.test(weekParam)) {
    const parsed = parseISO(weekParam);
    if (!Number.isNaN(parsed.getTime())) {
      return startOfWeek(parsed, { weekStartsOn: 1 });
    }
  }
  return startOfWeek(new Date(), { weekStartsOn: 1 });
}

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    studentId?: string;
    progTerm?: string;
    progYear?: string;
    returnTo?: string;
  }>;
}) {
  const { week, studentId, progTerm, progYear, returnTo } = await searchParams;
  // Ödemeler → Kaynak ders → Ödemelere geri dön: yalnızca allowlist edilmiş,
  // uygulama-içi bir panel yoluysa (bkz. resolveSafeReturnTo) geri dönüş
  // butonu render edilir — sahte/harici bir returnTo sessizce yok sayılır.
  const safeReturnTo = resolveSafeReturnTo(returnTo);
  const selectedTerm: ProgramTerm = progTerm === "yaz" ? "yaz" : "guz";
  const parsedYear = progYear ? Number(progYear) : NaN;
  const selectedAcademicYearStart = Number.isFinite(parsedYear) ? parsedYear : currentAcademicAnchorYear(selectedTerm);
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/program");
  }
  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  // ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu: statik küme +
  // tenant'ın aktif ek enstrümanları, ders planlama seçicilerine akar.
  const catalogResult = await listInstrumentCatalogTool(session, {});
  const catalogInstruments = catalogResult.ok
    ? catalogResult.data.entries.filter((e) => e.status === "active").map((e) => e.name)
    : undefined;
  const weekStart = resolveWeekStart(week);
  const todayWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const isCurrentWeek = isSameDay(weekStart, todayWeekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const weekStartParam = format(weekStart, "yyyy-MM-dd");
  const prevWeekParam = format(addDays(weekStart, -7), "yyyy-MM-dd");
  const nextWeekParam = format(addDays(weekStart, 7), "yyyy-MM-dd");
  const todayParam = format(todayWeekStart, "yyyy-MM-dd");

  const weekLessons = data.lessons.filter((l) => {
    const d = parseISO(l.startAt);
    return d >= days[0] && d <= addDays(days[6], 1);
  });

  const branchNames = Object.fromEntries(data.settings.branches.map((b) => [b.id, b.shortName]));

  // I — deneme dersleri ayrı tabloda (TrialLesson); programda ayrı renk/etiketle görünür.
  const weekTrials: ProgramTrial[] =
    kurum.scope.mode === "single"
      ? (await listTrialLessons(kurum.scope.tenantId))
          .filter((t) => {
            const d = parseISO(t.startAt);
            return t.status !== "cancelled" && d >= days[0] && d <= addDays(days[6], 1);
          })
          .map((t) => ({
            id: t.id,
            name: t.name,
            instrument: t.instrument,
            teacherId: t.teacherId,
            branchId: t.branchId,
            startAt: t.startAt,
            endAt: t.endAt,
            converted: Boolean(t.convertedStudentId),
          }))
      : [];

  /**
   * ÇALIŞMA GÜNÜ — TEK KAYNAK (src/lib/work-days.ts). Izgaranın kendi hafta
   * günü kuralını uydurmasını engeller: resmî tatil, dönemin haftalık kapalı
   * günü VE yöneticinin "zorla açık"/"zorla kapalı" istisnaları burada, ders
   * planlama doğrulamasıyla BİREBİR aynı fonksiyondan çözülür.
   */
  const dayStatuses: Record<string, WorkDayResolution> = Object.fromEntries(
    days.map((d) => {
      const resolved = resolveWorkDay(
        d,
        selectedTerm,
        data.closedDayOverrides ?? [],
        data.settings.termWeeklyClosedDays
      );
      return [resolved.date, resolved];
    })
  );

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <AssistantPageContext entity={{ kind: "page", label: "Ders Programı" }} />
      {safeReturnTo ? (
        <Link
          href={safeReturnTo}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Ödemelere geri dön
        </Link>
      ) : null}
      <PageHeader title="Ders programı" />

      <ProgramTermYearNav term={selectedTerm} academicYearStart={selectedAcademicYearStart} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/panel/program?week=${prevWeekParam}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          <ChevronLeft className="h-4 w-4" /> Önceki hafta
        </Link>

        <span className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] ring-1 ring-slate-200">
          {format(weekStart, "d MMM", { locale: tr })} –{" "}
          {format(addDays(weekStart, 6), "d MMM yyyy", { locale: tr })}
        </span>

        <Link
          href={`/panel/program?week=${nextWeekParam}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Sonraki hafta <ChevronRight className="h-4 w-4" />
        </Link>

        {isCurrentWeek ? (
          <span className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            Bugün
          </span>
        ) : (
          <Link
            href={`/panel/program?week=${todayParam}`}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            Bugün
          </Link>
        )}

        <WeekDatePicker value={weekStartParam} />
      </div>

      <ProgramStudio
        students={data.students}
        teachers={data.teachers}
        rooms={data.rooms}
        branchNames={branchNames}
        canCreate={kurum.scope.mode === "single"}
        workingHours={data.settings.workingHours}
        days={days.map((d) => d.toISOString())}
        weekLessons={weekLessons}
        todayIso={new Date().toISOString()}
        initialStudentFilter={studentId}
        selectedTerm={selectedTerm}
        selectedAcademicYearStart={selectedAcademicYearStart}
        catalogInstruments={catalogInstruments}
        dayStatuses={dayStatuses}
        weekTrials={weekTrials}
      />

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-[var(--color-text)] dark:text-slate-50">Stüdyolar</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {data.rooms.map((room) => (
            <div key={room.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-50">{room.name}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                {data.settings.branches.find((b) => b.id === room.branchId)?.shortName} · Kapasite{" "}
                {room.capacity} · {room.instruments.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
