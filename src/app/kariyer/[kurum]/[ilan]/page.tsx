import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Briefcase, CalendarClock, MapPin, Music2, Users } from "lucide-react";
import { resolveCareerTenant } from "@/lib/recruitment/institution";
import { getPublicCareerPage, getPublicJob } from "@/lib/recruitment/public";
import { CATEGORY_LABELS, EMPLOYMENT_LABELS } from "@/lib/recruitment/constants";
import { CareerShell, Prose } from "@/components/recruitment/career-shell";
import { CareerApplicationForm } from "@/components/recruitment/career-application-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kurum: string; ilan: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kurum, ilan } = await params;
  const tenant = await resolveCareerTenant(kurum);
  if (!tenant) return { title: "Kariyer" };
  if (ilan === "genel") return { title: `Genel başvuru — ${tenant.name}` };
  const job = await getPublicJob(tenant.tenantId, ilan);
  if (!job) return { title: `Kariyer — ${tenant.name}` };
  return {
    title: `${job.title} — ${tenant.name}`,
    description: job.summary || `${tenant.name} ${job.title} pozisyonu için online başvuru.`,
    openGraph: { title: `${job.title} — ${tenant.name}`, description: job.summary || undefined, type: "website" },
  };
}

const COMMON_INSTRUMENTS = ["Piyano", "Keman", "Gitar", "Bateri", "Şan", "Çello", "Flüt", "Bağlama", "Viyola", "Ukulele", "Saksafon", "Solfej"];

export default async function CareerJobPage({ params, searchParams }: Props) {
  const { kurum, ilan } = await params;
  const sp = await searchParams;
  const tenant = await resolveCareerTenant(kurum);
  if (!tenant) notFound();
  const page = await getPublicCareerPage(tenant);
  if (!page) notFound();
  const isGeneral = ilan === "genel";
  const job = isGeneral ? null : await getPublicJob(tenant.tenantId, ilan);
  if (!isGeneral && !job) notFound();

  const tracking: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if ((k === "kaynak" || k.startsWith("utm_")) && typeof v === "string") tracking[k] = v.slice(0, 80);

  let catalog: string[] = [];
  try {
    const { resolveActiveInstrumentNames } = await import("@/lib/instrument-catalog");
    catalog = await resolveActiveInstrumentNames(tenant.tenantId);
  } catch {
    catalog = [];
  }
  const suggestions = Array.from(new Set([...(job?.instruments ?? []), ...catalog, ...COMMON_INSTRUMENTS])).slice(0, 30);
  const closes = job?.closesAt
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" }).format(new Date(job.closesAt))
    : null;

  return (
    <CareerShell slug={tenant.slug} institutionName={page.institution.name} logoUrl={page.institution.logoUrl} website={page.institution.website}>
      <Link href={`/kariyer/${tenant.slug}`} className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
        <ArrowLeft className="h-4 w-4" /> Tüm pozisyonlar
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{job ? job.title : "Genel başvuru"}</h1>
          {job?.summary ? <p className="mt-2 text-lg text-[color:var(--text-secondary)]">{job.summary}</p> : null}
          {!job ? (
            <p className="mt-2 text-lg text-[color:var(--text-secondary)]">
              Şu an açık bir ilanla eşleşmiyorsanız da bilgilerinizi bırakın; öğretmen ya da personel ihtiyacımız olduğunda aday havuzumuzdan size ulaşalım.
            </p>
          ) : null}

          {job ? (
            <div className="mt-8 space-y-8">
              {job.description ? (
                <section>
                  <h2 className="mb-2 text-lg font-semibold">Pozisyon hakkında</h2>
                  <Prose text={job.description} />
                </section>
              ) : null}
              {job.requirements ? (
                <section>
                  <h2 className="mb-2 text-lg font-semibold">Aradığımız nitelikler</h2>
                  <Prose text={job.requirements} />
                </section>
              ) : null}
              {job.benefits ? (
                <section>
                  <h2 className="mb-2 text-lg font-semibold">Sunduklarımız</h2>
                  <Prose text={job.benefits} />
                </section>
              ) : null}
            </div>
          ) : null}

          <section id="basvuru" className="mt-10 scroll-mt-6">
            <h2 className="mb-1 text-2xl font-semibold">Başvuru formu</h2>
            <p className="mb-5 text-sm text-[var(--color-text-muted)]">
              CV&apos;nizi yüklerseniz bilgilerinizi otomatik dolduralım; sonra kontrol edip gönderin. Yaklaşık 3 dakika sürer.
            </p>
            <CareerApplicationForm
              slug={tenant.slug}
              jobSlug={job?.slug ?? "genel"}
              jobTitle={job?.title ?? null}
              fixedCategory={job?.category ?? null}
              instrumentSuggestions={suggestions}
              kvkkText={page.settings.kvkkText}
              tracking={tracking}
              institutionName={page.institution.name}
            />
          </section>
        </div>

        <aside className="order-first lg:order-none lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
            <dl className="space-y-3 text-sm">
              {job ? (
                <>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <dt className="sr-only">Tür</dt>
                    <dd>{CATEGORY_LABELS[job.category]}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <dt className="sr-only">Çalışma şekli</dt>
                    <dd>{EMPLOYMENT_LABELS[job.employmentType]}</dd>
                  </div>
                  {job.location ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[var(--color-text-muted)]" />
                      <dt className="sr-only">Konum</dt>
                      <dd>{job.location}</dd>
                    </div>
                  ) : null}
                  {job.instruments.length ? (
                    <div className="flex items-start gap-2">
                      <Music2 className="mt-0.5 h-4 w-4 text-[var(--color-text-muted)]" />
                      <dt className="sr-only">Enstrümanlar</dt>
                      <dd>{job.instruments.join(", ")}</dd>
                    </div>
                  ) : null}
                  {closes ? (
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-[var(--color-text-muted)]" />
                      <dt className="sr-only">Son başvuru</dt>
                      <dd>Son başvuru: {closes}</dd>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[var(--color-text-muted)]">Öğretmen veya personel olarak aday havuzumuza katılın.</p>
              )}
            </dl>
            <a
              href="#basvuru"
              className="mt-5 flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Hemen başvur
            </a>
          </div>
        </aside>
      </div>
    </CareerShell>
  );
}
