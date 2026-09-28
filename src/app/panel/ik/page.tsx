import Link from "next/link";
import { CalendarClock, Inbox, Megaphone, UserCheck, Users, ShieldAlert, ArrowRight } from "lucide-react";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { getDashboardTool } from "@/lib/recruitment/tools";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { applicationNumber, CATEGORY_LABELS, INTERVIEW_KIND_LABELS, PIPELINE_STAGES, SOURCE_LABELS, fullName } from "@/lib/recruitment/constants";
import { StageBadge } from "@/components/recruitment/badges";
import { CopyLink } from "@/components/recruitment/copy-link";
import { RetentionButton } from "@/components/recruitment/retention-button";
import type { ApplicationSource } from "@/lib/recruitment/types";

export const dynamic = "force-dynamic";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function IkDashboardPage() {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik");
  if (allMode) {
    return (
      <>
        <PageHeader title="İnsan Kaynakları" />
        <EmptyState title="Tek bir kurum seçin" description="İK modülü kurum bazında çalışır. Üst menüdeki kurum seçiciden bir kurum seçin." />
      </>
    );
  }
  const res = await runWithTenantAsync(ctx.tenantId, () => getDashboardTool(ctx));
  if (!res.ok) return <EmptyState title="Özet yüklenemedi" description={res.error.message} />;
  const d = res.data;
  const base = `/kariyer/${d.careerSlug}`;
  const pipelineMax = Math.max(1, ...d.byStage.filter((s) => PIPELINE_STAGES.includes(s.stage)).map((s) => s.count));
  const sourceTotal = d.bySource.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <>
      <PageHeader
        title="İnsan Kaynakları"
        description="İlanlar, başvurular, görüşmeler ve aday iletişimi tek yerde. Kariyer bağlantınızı LinkedIn ve Kariyer.net ilanlarınıza ekleyin; başvurular buraya düşer."
        actions={
          <>
            <Link href="/panel/ik/ilanlar/yeni" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
              Yeni ilan
            </Link>
            <Link href="/panel/ik/adaylar" className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]">
              Aday havuzu
            </Link>
          </>
        }
      />

      {d.retentionDue > 0 ? (
        <Card className="mb-6 border-[var(--color-warning)] bg-[var(--color-warning-soft)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-5 w-5 text-[var(--color-warning)]" />
              <span><strong>{d.retentionDue}</strong> başvurunun KVKK saklama süresi doldu. Kişisel veriler anonimleştirilmeli.</span>
            </p>
            <RetentionButton count={d.retentionDue} />
          </div>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Yayındaki ilan" value={d.openJobs} icon={<Megaphone className="h-5 w-5" />} />
        <StatCard label="İncelenmeyi bekleyen" value={d.awaitingReview} accent="warning" icon={<Inbox className="h-5 w-5" />} hint="Aşama: Yeni" />
        <StatCard label="Son 7 gün başvuru" value={d.newThisWeek} accent="info" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Süreçteki aday" value={d.totalActive} icon={<CalendarClock className="h-5 w-5" />} hint={`${d.byCategory.teacher} öğretmen · ${d.byCategory.staff} personel`} />
        <StatCard label="Bu ay işe alınan" value={d.hiredThisMonth} accent="success" icon={<UserCheck className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold">Aday hunisi</h2>
          <div className="space-y-2.5">
            {d.byStage
              .filter((s) => PIPELINE_STAGES.includes(s.stage))
              .map((s) => (
                <Link key={s.stage} href={`/panel/ik/adaylar?asama=${s.stage}`} className="group grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                  <span className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]">{s.label}</span>
                  <span className="h-6 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]">
                    <span className="block h-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] transition-all group-hover:opacity-80" style={{ width: `${Math.max(2, (s.count / pipelineMax) * 100)}%` }} />
                  </span>
                  <span className="text-right font-medium tabular-nums">{s.count}</span>
                </Link>
              ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
            {d.byStage
              .filter((s) => !PIPELINE_STAGES.includes(s.stage))
              .map((s) => (
                <Link key={s.stage} href={`/panel/ik/adaylar?asama=${s.stage}`} className="hover:text-[var(--color-text)]">
                  {s.label}: <strong className="text-[var(--color-text)]">{s.count}</strong>
                </Link>
              ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-base font-semibold">Kariyer sayfanız</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">İlan metninize ekleyin — kaynak etiketi, başvurunun nereden geldiğini gösterir.</p>
          <div className="space-y-2">
            <CopyLink path={base} label="Genel" />
            <CopyLink path={`${base}?kaynak=linkedin`} label="LinkedIn" />
            <CopyLink path={`${base}?kaynak=kariyer-net`} label="Kariyer.net" />
            <CopyLink path={`${base}?kaynak=instagram`} label="Instagram" />
          </div>
          <Link href={base} target="_blank" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]">
            Sayfayı aç <ArrowRight className="h-4 w-4" />
          </Link>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Başvuru kaynakları</h3>
          {d.bySource.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Henüz başvuru yok.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.bySource.map((s) => (
                <li key={s.source} className="flex items-center justify-between gap-2">
                  <span>{SOURCE_LABELS[s.source as ApplicationSource] ?? s.source}</span>
                  <span className="tabular-nums text-[var(--color-text-muted)]">
                    {s.count} · %{Math.round((s.count / sourceTotal) * 100)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Son başvurular</h2>
            <Link href="/panel/ik/adaylar" className="text-sm text-[var(--color-primary)]">Tümü</Link>
          </div>
          {d.recent.length === 0 ? (
            <EmptyState title="Henüz başvuru yok" description="Bir ilan yayınlayıp kariyer bağlantınızı paylaşın." />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {d.recent.map((a) => {
                const job = d.jobs.find((j) => j.id === a.jobId);
                return (
                  <li key={a.id}>
                    <Link href={`/panel/ik/adaylar/${a.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-[var(--color-surface-muted)]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{fullName(a)}</span>
                        <span className="block truncate text-xs text-[var(--color-text-muted)]">
                          {applicationNumber(a.seq)} · {job?.title ?? `Genel (${CATEGORY_LABELS[a.category]})`}
                          {a.instruments.length ? ` · ${a.instruments.join(", ")}` : ""}
                        </span>
                      </span>
                      <StageBadge stage={a.stage} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-semibold">Yaklaşan görüşmeler</h2>
          {d.upcomingInterviews.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Planlanmış görüşme yok.</p>
          ) : (
            <ul className="space-y-3">
              {d.upcomingInterviews.map((i) => (
                <li key={i.id}>
                  <Link href={`/panel/ik/adaylar/${i.applicationId}`} className="block rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 hover:bg-[var(--color-surface-muted)]">
                    <p className="text-sm font-medium">{i.candidateName}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {INTERVIEW_KIND_LABELS[i.kind]} · {fmt(i.scheduledAt)}
                      {i.location ? ` · ${i.location}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
