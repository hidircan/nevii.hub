import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/link";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { PanelMock, screenForFeature } from "@/components/site/product-screens";
import { FEATURES, getFeature } from "@/lib/marketing/features";
import { SECTORS } from "@/lib/marketing/sectors";
import { breadcrumb, pageMetadata, SITE_URL } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = getFeature((await params).slug);
  return f ? pageMetadata(`/ozellikler/${f.slug}`, f.title, f.summary, { keywords: f.keywords }) : {};
}

export default async function FeaturePage({ params }: Props) {
  const f = getFeature((await params).slug);
  if (!f) notFound();
  const screen = screenForFeature(f.slug, f.group);
  const sectors = SECTORS.filter((s) => s.answers.some((a) => a.feature === f.slug));
  const related = FEATURES.filter((x) => x.group === f.group && x.slug !== f.slug).slice(0, 3);
  const faq = [
    { q: `${f.title} hangi kurumlar için uygundur?`, a: `${f.title}, müzik okulu, dans ve yoga stüdyosu, dil kursu, etüt merkezi, spor akademisi ve sanat atölyesi gibi ders veren her kurumda kullanılabilir. Terimler ve kurallar kurumunuza göre ayarlanır.` },
    { q: `${f.screen} ekranı kurumumuzun sürecine uyarlanabilir mi?`, a: "Evet. Paketler, kurallar, ücretler ve şablonlar kurumunuza göre tanımlanır. Farklı işleyen bir süreciniz varsa görüşelim, ihtiyacınıza göre uyarlayalım." },
    { q: "Verilerimiz güvende mi?", a: "Her kurumun verisi ayrı tutulur, ekranlara yalnız yetkili kişiler erişir ve kritik işlemler denetim kaydına yazılır." },
  ];
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Özellikler", path: "/ozellikler" }, { name: f.title, path: `/ozellikler/${f.slug}` }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", url: `${SITE_URL}/ozellikler/${f.slug}`, mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }} />
      <PageHero eyebrow={f.group} title={f.title} lead={f.lead} crumbs={[{ href: "/ozellikler", label: "Özellikler" }]}>
        <p className="mt-6 inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/90">Panelde: {f.screen}</p>
      </PageHero>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
        <div className="nh-view-up">
          <h2 className="text-2xl font-semibold tracking-tight">Neler yapabilirsiniz?</h2>
          <ul className="mt-6 space-y-3">
            {f.points.map((p) => (
              <li key={p} className="flex gap-3 text-base text-slate-700">
                <svg aria-hidden viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m3 8.5 3.5 3.5L13 4.5" /></svg>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="nh-view-up"><PanelMock active={screen.active}>{screen.node}</PanelMock></div>
      </section>
      <section className="bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">Sıkça sorulanlar</h2>
          <div className="mt-6 space-y-3">
            {faq.map((x) => (
              <details key={x.q} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                <summary className="cursor-pointer font-semibold text-slate-900">{x.q}</summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{x.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        {sectors.length > 0 ? (
          <div className="mb-10">
            <h2 className="text-xl font-semibold tracking-tight">Bu özelliği öne çıkaran kurumlar</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {sectors.map((s) => (
                <li key={s.slug}><Link href={`/sektorler/${s.slug}`} className="block rounded-full border border-amber-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-amber-50">{s.name}</Link></li>
              ))}
            </ul>
          </div>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight">İlgili özellikler</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {related.map((r) => (
            <li key={r.slug}>
              <Link href={`/ozellikler/${r.slug}`} className="nh-lift block h-full rounded-2xl border border-slate-200 p-5 hover:border-amber-300">
                <span className="font-semibold text-slate-900">{r.title}</span>
                <span className="mt-2 block text-sm text-slate-600">{r.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <LeadBand title={`${f.title} kurumunuzda nasıl çalışır?`} source={f.slug} />
    </MarketingShell>
  );
}
