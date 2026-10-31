import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/link";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { getPost } from "@/lib/marketing/blog";
import { getFeature } from "@/lib/marketing/features";
import { breadcrumb, pageMetadata, SITE_URL } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = getPost((await params).slug);
  return p ? pageMetadata(`/blog/${p.slug}`, p.title, p.description, { type: "article" }) : {};
}

export default async function PostPage({ params }: Props) {
  const p = getPost((await params).slug);
  if (!p) notFound();
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Blog", path: "/blog" }, { name: p.title, path: `/blog/${p.slug}` }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.description, datePublished: p.date, inLanguage: "tr-TR", url: `${SITE_URL}/blog/${p.slug}`, author: { "@type": "Organization", name: "NeviiHub" }, publisher: { "@type": "Organization", name: "NeviiHub" } }} />
      <PageHero eyebrow={p.sector} title={p.title} lead={p.description} crumbs={[{ href: "/blog", label: "Blog" }]} />
      <article className="mx-auto max-w-3xl px-6 py-14">
        {p.sections.map((s) => (
          <section key={s.heading} className="mb-9">
            <h2 className="text-2xl font-semibold tracking-tight">{s.heading}</h2>
            <p className="mt-3 text-[17px] leading-relaxed text-slate-700">{s.body}</p>
          </section>
        ))}
        <aside className="rounded-2xl bg-[#fbf8f2] p-6 ring-1 ring-amber-900/10">
          <p className="font-semibold text-slate-900">NeviiHub&apos;da bu konuyla ilgili</p>
          <ul className="mt-3 space-y-2">
            {p.features.map((slug) => {
              const f = getFeature(slug);
              return f ? <li key={slug}><Link href={`/ozellikler/${slug}`} className="font-medium text-amber-800 hover:underline">{f.title}</Link></li> : null;
            })}
            <li><Link href={`/sektorler/${p.sectorSlug}`} className="font-medium text-amber-800 hover:underline">Sektör çözümünü görün</Link></li>
          </ul>
        </aside>
      </article>
      <LeadBand title="Bunu kurumunuzda birlikte kuralım" source={p.slug} />
    </MarketingShell>
  );
}
