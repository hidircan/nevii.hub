import Link from "@/components/link";
import { Pencil, Users, ExternalLink } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { listJobsTool } from "@/lib/recruitment/tools";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { CATEGORY_LABELS, EMPLOYMENT_LABELS } from "@/lib/recruitment/constants";
import { CopyLink } from "@/components/recruitment/copy-link";
import { JobStatusMenu } from "@/components/recruitment/job-status-menu";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { ctx, allMode } = await requireRecruitmentPage("/panel/ik/ilanlar");
  if (allMode) return <EmptyState title="Tek bir kurum seçin" />;
  const res = await runWithTenantAsync(ctx.tenantId, () => listJobsTool(ctx));
  if (!res.ok) return <EmptyState title="İlanlar yüklenemedi" description={res.error.message} />;
  const { jobs, careerSlug } = res.data;
  const visible = jobs.filter((j) => j.status !== "archived");
  const archived = jobs.filter((j) => j.status === "archived");
  return (
    <>
      <PageHeader
        title="İş ilanları"
        description="Yayındaki ilanlar kariyer sayfanızda görünür. Her ilanın bağlantısını LinkedIn / Kariyer.net ilan metnine ekleyin."
        actions={<Link href="/panel/ik/ilanlar/yeni" className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white">Yeni ilan</Link>}
      />
      {visible.length === 0 ? (
        <EmptyState title="Henüz ilan yok" description="İlk ilanınızı oluşturun; yayınladığınızda kariyer sayfanızda görünür." />
      ) : (
        <div className="space-y-3">
          {visible.map((j) => (
            <div key={j.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{j.title}</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {CATEGORY_LABELS[j.category]} · {EMPLOYMENT_LABELS[j.employmentType]}
                    {j.location ? ` · ${j.location}` : ""}
                    {j.instruments.length ? ` · ${j.instruments.join(", ")}` : ""}
                    {j.closesAt ? ` · son başvuru ${new Date(j.closesAt).toLocaleDateString("tr-TR")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/panel/ik/adaylar?ilan=${j.id}`} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-medium">
                    <Users className="h-3.5 w-3.5" /> {j.applicationCount} aday{j.newCount ? ` (${j.newCount} yeni)` : ""}
                  </Link>
                  <Link href={`/panel/ik/ilanlar/${j.id}`} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-medium">
                    <Pencil className="h-3.5 w-3.5" /> Düzenle
                  </Link>
                  <JobStatusMenu id={j.id} status={j.status} />
                </div>
              </div>
              {j.status === "published" ? (
                <div className="mt-3 grid gap-1.5 border-t border-[var(--color-border)] pt-3">
                  <CopyLink path={`/kariyer/${careerSlug}/${j.slug}?kaynak=linkedin`} label="LinkedIn" />
                  <CopyLink path={`/kariyer/${careerSlug}/${j.slug}?kaynak=kariyer-net`} label="Kariyer.net" />
                  <a href={`/kariyer/${careerSlug}/${j.slug}`} target="_blank" rel="noopener" className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--color-primary)]">
                    İlan sayfasını aç <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {archived.length ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-[var(--color-text-muted)]">Arşivlenmiş ilanlar ({archived.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {archived.map((j) => (
              <li key={j.id} className="flex items-center gap-3">
                <Link href={`/panel/ik/ilanlar/${j.id}`} className="hover:text-[var(--color-primary)]">{j.title}</Link>
                <JobStatusMenu id={j.id} status={j.status} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
