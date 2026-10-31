import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/link";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { BLOG_POSTS } from "@/lib/marketing/blog";
import { getFeature } from "@/lib/marketing/features";
import { getSector } from "@/lib/marketing/sectors";
import { breadcrumb, pageMetadata } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = getSector((await params).slug);
  return s ? pageMetadata(`/sektorler/${s.slug}`, `${s.name} İçin Yönetim Yazılımı`, s.summary, { keywords: s.keywords }) : {};
}

export default async function SectorPage({ params }: Props) {
  const s = getSector((await params).slug);
  if (!s) notFound();
  const posts = BLOG_POSTS.filter((p) => p.sectorSlug === s.slug);
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Sektörler", path: "/sektorler" }, { name: s.name, path: `/sektorler/${s.slug}` }])} />
      <PageHero eyebrow={s.name} title={s.headline} lead={s.summary} crumbs={[{ href: "/sektorler", label: "Sektörler" }]} />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Tanıdık geliyor mu?</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {s.pains.map((p) => (
            <li key={p} className="nh-view-up rounded-2xl bg-[#fbf8f2] p-6 text-base font-medium text-slate-800 ring-1 ring-amber-900/10">{p}</li>
          ))}
        </ul>
        <h2 className="mt-14 text-2xl font-semibold tracking-tight">NeviiHub bunu nasıl çözer?</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {s.answers.map((a) => {
            const f = getFeature(a.feature);
            return f ? (
              <li key={a.feature} className="nh-view-up">
                <Link href={`/ozellikler/${f.slug}`} className="nh-lift block h-full rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-amber-300">
                  <span className="text-lg font-semibold text-slate-900">{f.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-slate-600">{a.text}</span>
                  <span className="mt-3 block text-sm font-semibold text-amber-800">Ayrıntılar →</span>
                </Link>
              </li>
            ) : null;
          })}
        </ul>
        <p className="mt-10 rounded-2xl bg-slate-50 p-6 text-base leading-relaxed text-slate-700">
          Başka bir kurumun yazılımına uymak zorunda değilsiniz: branşlarınız, paketleriniz, ücret kurallarınız ve formlarınız kurumunuza göre tanımlanır. Size özel bir süreç varsa görüşüp uyarlayalım.
        </p>
        {posts.length > 0 ? (
          <div className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">Bu alanda okuyun</h2>
            <ul className="mt-4 space-y-2">
              {posts.map((p) => (
                <li key={p.slug}><Link href={`/blog/${p.slug}`} className="font-medium text-amber-800 hover:underline">{p.title}</Link></li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <LeadBand title={`${s.name} için NeviiHub'ı konuşalım`} source={s.slug} />
    </MarketingShell>
  );
}
