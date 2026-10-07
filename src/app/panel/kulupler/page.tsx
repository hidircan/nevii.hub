import Link from "@/components/link";
import { redirect } from "next/navigation";
import { ExternalLink, Inbox, Users } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { ClubApplicationsToggle, ClubForm, CopyLinkButton } from "@/components/club-components";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { CLUB_AUDIENCE_LABEL, CLUB_FEE_PERIOD_LABEL, clubApplicationIssues, isMembershipActive, isSolfegeClub, listClubsTool } from "@/lib/clubs";
import { countOpenClubApplications } from "@/lib/club-applications";
import { careerSlugForTenant } from "@/lib/recruitment/institution";
import { readReferenceData } from "@/lib/store";
import { resolveActiveInstrumentNames } from "@/lib/instrument-catalog";
import { DEFAULT_APP_TIMEZONE, toZonedYmd } from "@/lib/timezone";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 2026-10-05 — Kulüpler: grup dersi mantığında kulüpler ve üyeleri.
 * 2026-10-07 — Grup dersi başvuru portalı: portal bağlantısı, başvuruya aç/kapat, açık başvuru sayacı, Başvurular.
 */
export default async function KuluplerPage({ searchParams }: { searchParams: Promise<{ yeni?: string }> }) {
  const { yeni } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/kulupler");
  }
  const kurum = await getInstitutionContext(session);
  // Yazım oturumun kurumuna gider; başka kurum seçiliyken gösterilmez (Notlar ile aynı kural).
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) {
    return (
      <div>
        <KurumScopeNote scope={kurum.scope} />
        <PageHeader title="Kulüpler" />
        <EmptyState title="Kendi kurumunuzu seçin" description="Kulüpler kurum bazındadır. Üstteki kurum seçiciden kendi kurumunuzu seçin." />
      </div>
    );
  }
  const result = await listClubsTool(session);
  if (!result.ok) {
    return (
      <div>
        <PageHeader title="Kulüpler" />
        <EmptyState title="Bu ekrana erişiminiz yok" description={result.error.message} />
      </div>
    );
  }
  const { clubs, memberships } = result.data;
  const [data, instruments, slug, appCounts] = await Promise.all([
    readReferenceData(),
    resolveActiveInstrumentNames(session.tenantId),
    careerSlugForTenant(session.tenantId),
    countOpenClubApplications(session.tenantId),
  ]);
  const portalPath = `/basvuru/${slug}/kulup`;
  const today = toZonedYmd(new Date(), DEFAULT_APP_TIMEZONE);
  const teachers = data.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const branches = data.settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name }));
  const solfegeClubs = clubs.filter(isSolfegeClub).map((c) => ({ id: c.id, name: c.name, audience: c.audience, branchId: c.branchId }));
  const activeOf = (clubId: string) => memberships.filter((m) => m.clubId === clubId && isMembershipActive(m, today));
  const totals = clubs.reduce(
    (acc, c) => {
      const act = activeOf(c.id);
      return { members: acc.members + act.length, revenue: acc.revenue + (c.feePeriod === "monthly" ? act.reduce((s, m) => s + m.monthlyFee, 0) : 0) };
    },
    { members: 0, revenue: 0 }
  );
  const openCount = clubs.filter((c) => c.applicationsOpen && c.active && clubApplicationIssues(c, today).length === 0).length;
  const openApps = Object.values(appCounts.byClub).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kulüpler"
        description={`${clubs.filter((c) => c.active).length} aktif kulüp · ${totals.members} aktif üye · aylık ${formatMoney(totals.revenue)} kulüp geliri`}
        actions={
          yeni ? undefined : (
            <Link href="/panel/kulupler?yeni=1" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)]">
              + Yeni kulüp
            </Link>
          )
        }
      />

      <section aria-labelledby="portal-title" className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 id="portal-title" className="text-sm font-semibold">Grup dersi başvuru portalı</h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Oturum açmadan erişilen, kurumunuza özel sayfa. Yalnız “Başvuruya açık” kulüpler listelenir ({openCount} kulüp). Öğretmen ve üye bilgisi gösterilmez.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={portalPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-inverted)]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Başvuru portalını aç
            </a>
            <CopyLinkButton path={portalPath} />
            <code className="truncate rounded bg-[var(--color-surface-muted)] px-2 py-1 text-[11px] text-[var(--color-text-muted)]">{portalPath}</code>
          </div>
        </div>
        <Link
          href="/panel/kulupler/basvurular"
          className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-primary)]"
        >
          <span className="flex items-center gap-3">
            <Inbox className="h-6 w-6 text-[var(--color-primary)]" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold">Başvurular</span>
              <span className="block text-xs text-[var(--color-text-muted)]">
                {appCounts.newTotal} yeni · {openApps} açık (yeni, iletişimde, bekleme listesi)
              </span>
            </span>
          </span>
          <span className="text-xs font-semibold text-[var(--color-primary)]">Başvuruları yönet →</span>
        </Link>
      </section>

      {yeni ? (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Yeni kulüp</p>
            <Link href="/panel/kulupler" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Kapat ✕</Link>
          </div>
          <ClubForm instruments={instruments} branches={branches} teachers={teachers} solfegeClubs={solfegeClubs} goToDetail />
        </Card>
      ) : null}
      {clubs.length === 0 ? (
        <EmptyState title="Henüz kulüp yok" description="Ör. Keman — Çocuk: ad, alan, kontenjan ve ücreti belirleyerek ilk kulübü taslak olarak oluşturun; üye veya öğretmen seçmeniz gerekmez." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clubs.map((c) => {
            const act = activeOf(c.id);
            const pct = Math.min(100, Math.round((act.length / c.maxMembers) * 100));
            const pending = appCounts.byClub[c.id] ?? 0;
            const issues = clubApplicationIssues(c, today);
            return (
              <div key={c.id} className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-primary)]">
                <Link href={`/panel/kulupler/${c.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-text)]">{c.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {c.instrument}
                        {c.audience ? ` · ${CLUB_AUDIENCE_LABEL[c.audience]}` : ""} · {c.branchId ? (branches.find((b) => b.id === c.branchId)?.name ?? "—") : "Şube bağımsız"} · {c.durationMinutes} dk
                      </p>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {!c.active ? (
                        <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">Pasif</span>
                      ) : null}
                      {pending > 0 ? (
                        <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary-soft-text)]">{pending} başvuru</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" /> {act.length}/{c.maxMembers} üye
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(c.monthlyFee)} / {CLUB_FEE_PERIOD_LABEL[c.feePeriod]}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--color-warning)" : "var(--color-primary)" }} />
                    </div>
                  </div>
                  <p className="mt-3 truncate text-xs text-[var(--color-text-muted)]">
                    Öğretmen: {c.teacherIds.length ? c.teacherIds.map((id) => data.teachers.find((t) => t.id === id)?.name ?? "—").join(", ") : "seçilmedi"}
                  </p>
                  {c.startDate || c.endDate ? (
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      Dönem: {c.startDate ? c.startDate.split("-").reverse().join(".") : "—"} – {c.endDate ? c.endDate.split("-").reverse().join(".") : "—"}
                    </p>
                  ) : null}
                </Link>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
                  <ClubApplicationsToggle clubId={c.id} open={c.applicationsOpen} />
                  {c.applicationsOpen && issues.length === 0 ? <CopyLinkButton path={`${portalPath}?kulup=${encodeURIComponent(c.id)}`} label="Kulübe özel bağlantı" /> : null}
                  {c.applicationsOpen && issues.length > 0 ? (
                    <span className="text-[11px] text-[var(--color-warning)]">Portalda görünmüyor: {issues.join(", ")}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
