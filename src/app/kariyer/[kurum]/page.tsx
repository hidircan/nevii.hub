import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Briefcase, MapPin, Music2, ArrowRight, Sparkles } from "lucide-react";
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { getPublicCareerPage } from "@/lib/recruitment/public";
import { CATEGORY_LABELS, EMPLOYMENT_LABELS } from "@/lib/recruitment/constants";
import { CareerShell, Prose } from "@/components/recruitment/career-shell";
import type { RecruitmentJob } from "@/lib/recruitment/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kurum: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kurum } = await params;
  const tenant = await resolveCareerTenant(kurum);
  const name = tenant?.name ?? "Kariyer";
  return {
    title: `Açık pozisyonlar — ${name}`,
    description: `${name} bünyesindeki açık öğretmen ve personel pozisyonları. Hemen online başvurun.`,
    robots: { index: true, follow: true },
  };
}

function keepTracking(sp: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if ((k === "kaynak" || k.startsWith("utm_")) && typeof v === "string") p.set(k, v.slice(0, 80));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function JobCard({ job, href }: { job: RecruitmentJob; href: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-snug">{job.title}</h3>
        <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-[var(--color-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]" />
      </div>
      {job.summary ? <p className="line-clamp-2 text-sm text-[var(--color-text-muted)]">{job.summary}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1">
          <Briefcase className="h-3.5 w-3.5" /> {EMPLOYMENT_LABELS[job.employmentType]}
        </span>
        {job.location ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1">
            <MapPin className="h-3.5 w-3.5" /> {job.location}
          </span>
        ) : null}
        {job.instruments.slice(0, 4).map((i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-[var(--color-primary-soft-text)]">
            <Music2 className="h-3.5 w-3.5" /> {i}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default async function CareerHome({ params, searchParams }: Props) {
  const { kurum } = await params;
  const sp = await searchParams;
  const tenant = await resolveCareerTenant(kurum);
  if (!tenant) notFound();
  const page = await getPublicCareerPage(tenant);
  if (!page) notFound();
  const track = keepTracking(sp);
  const teacherJobs = page.jobs.filter((j) => j.category === "teacher");
  const staffJobs = page.jobs.filter((j) => j.category === "staff");

  return (
    <CareerShell slug={tenant.slug} institutionName={page.institution.name} logoUrl={page.institution.logoUrl} website={page.institution.website}>
      <section className="mb-10 rounded-[var(--radius-lg)] bg-[var(--color-primary-soft)] px-6 py-10 sm:px-10">
        <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary-soft-text)]">
          <Sparkles className="h-4 w-4" /> Ekibimize katılın
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.institution.name} kariyer fırsatları</h1>
        <div className="mt-3 max-w-2xl">
          {page.settings.careerPageIntro ? (
            <Prose text={page.settings.careerPageIntro} />
          ) : (
            <p className="text-[15px] text-[color:var(--text-secondary)]">
              Müziği sevdiren öğretmenler ve öğrencilerimize en iyi deneyimi sunan bir ekip arıyoruz. Açık pozisyonlarımızı inceleyin, CV&apos;nizi yükleyin — birkaç dakikada başvurun.
            </p>
          )}
        </div>
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          {page.jobs.length > 0 ? `${page.jobs.length} açık pozisyon` : "Şu an açık ilanımız yok — genel başvuru yapabilirsiniz."}
        </p>
      </section>

      {[
        { title: `${CATEGORY_LABELS.teacher} pozisyonları`, jobs: teacherJobs },
        { title: `${CATEGORY_LABELS.staff} pozisyonları`, jobs: staffJobs },
      ]
        .filter((g) => g.jobs.length > 0)
        .map((g) => (
          <section key={g.title} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">{g.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.jobs.map((j) => (
                <JobCard key={j.id} job={j} href={`/kariyer/${tenant.slug}/${j.slug}${track}`} />
              ))}
            </div>
          </section>
        ))}

      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-center">
        <h2 className="text-lg font-semibold">Aradığınız pozisyonu bulamadınız mı?</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Genel başvuru bırakın; uygun bir pozisyon açıldığında aday havuzumuzdan sizinle iletişime geçelim.
        </p>
        <Link
          href={`/kariyer/${tenant.slug}/genel${track}`}
          className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Genel başvuru yap <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </CareerShell>
  );
}
