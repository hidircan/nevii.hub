import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarCheck2, Music2, PhoneCall } from "lucide-react";
import { resolveCareerTenant, getInstitutionInfo } from "@/lib/recruitment/institution";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { CareerLogo } from "@/components/recruitment/career-logo";
import { TrialApplicationForm } from "@/components/trial-application-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ kurum: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await resolveCareerTenant((await params).kurum);
  return tenant
    ? { title: `Ücretsiz deneme dersi — ${tenant.name}`, description: `${tenant.name} için online deneme dersi başvurusu.` }
    : { title: "Deneme dersi başvurusu" };
}

/** 2026-10-05 — Herkese açık deneme dersi başvuru sayfası (kurum markalı, panel kabuğundan bağımsız). */
export default async function TrialApplicationPage({ params, searchParams }: Props) {
  const tenant = await resolveCareerTenant((await params).kurum);
  if (!tenant) notFound();
  const sp = await searchParams;
  const source = typeof sp.kaynak === "string" ? sp.kaynak.slice(0, 80) : undefined;
  const institution = await getInstitutionInfo(tenant.tenantId);
  const { instruments, branches } = await runWithTenantAsync(tenant.tenantId, async () => {
    const [{ resolveActiveInstrumentNames }, { readReferenceData }] = await Promise.all([
      import("@/lib/instrument-catalog"),
      import("@/lib/store"),
    ]);
    return {
      instruments: await resolveActiveInstrumentNames(tenant.tenantId),
      branches: (await readReferenceData()).settings.branches.map((b) => ({ id: b.id, name: b.shortName || b.name, address: b.address })),
    };
  });
  const logo =
    institution.logoUrl && (institution.logoUrl.startsWith("data:image/") || institution.logoUrl.startsWith("https://"))
      ? institution.logoUrl
      : undefined;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <CareerLogo logoUrl={logo} name={institution.name} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{institution.name}</span>
            <span className="block text-xs text-[var(--color-text-muted)]">Deneme dersi başvurusu</span>
          </span>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section className="lg:pt-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-trial)" }}>
            Ücretsiz deneme dersi
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">
            Müziğe ilk adımı birlikte atalım.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-text-muted)]">
            Enstrümanınızı ve size uygun zamanı seçin; ekibimiz sizi arayıp deneme dersinizi kesinleştirsin.
          </p>
          <ol className="mt-8 space-y-5">
            {[
              { icon: Music2, title: "Enstrümanı seçin", text: "Öğrenmek istediğiniz enstrümanı ve size yakın şubeyi seçin." },
              { icon: CalendarCheck2, title: "Uygun zamanı işaretleyin", text: "Öğretmenlerimizin boş saatlerinden size uyan en fazla üç seçeneği işaretleyin." },
              { icon: PhoneCall, title: "Sizi arayalım", text: "Seçtiğiniz zamanı telefonla birlikte kesinleştiririz; hiçbir ücret alınmaz." },
            ].map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ background: "var(--color-trial-soft, var(--color-primary-soft))", color: "var(--color-trial)" }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <s.icon className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--color-text-muted)]">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          {institution.phone ? (
            <p className="mt-8 text-sm text-[var(--color-text-muted)]">
              Sorunuz mu var?{" "}
              <a href={`tel:${institution.phone.replace(/\s/g, "")}`} className="font-medium text-[var(--color-text)] underline-offset-2 hover:underline">
                {institution.phone}
              </a>
            </p>
          ) : null}
        </section>
        <TrialApplicationForm
          slug={tenant.slug}
          institutionName={institution.name}
          instruments={instruments}
          branches={branches}
          source={source}
        />
      </main>
      <footer className="border-t border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">
        {institution.name} · Kişisel verileriniz KVKK kapsamında korunur · Nevii Hub ile hazırlanmıştır
      </footer>
    </div>
  );
}
