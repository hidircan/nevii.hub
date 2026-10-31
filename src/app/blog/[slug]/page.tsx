import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/link";
import { BlogCard } from "@/components/site/blog-card";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { getBlogCategory, parseBlogBody } from "@/lib/marketing/blog";
import { getFeature } from "@/lib/marketing/features";
import { getSector } from "@/lib/marketing/sectors";
import { breadcrumb, pageMetadata, SITE_URL } from "@/lib/marketing/seo";
import { getPublishedPost, listPublishedPosts, readPostFresh } from "@/lib/platform/blog";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ onizleme?: string }> };

/** Taslağı yalnız platform sahibi, önizleme bağlantısıyla görür. */
async function loadPost({ params, searchParams }: Props) {
  const { slug } = await params;
  if ((await searchParams).onizleme === "1" && (await getSessionContext())?.role === "HYPER_ADMIN") return readPostFresh(slug);
  return getPublishedPost(slug);
}

const dateTr = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await loadPost(props);
  return p ? pageMetadata(`/blog/${p.slug}`, p.title, p.description, { type: "article", noindex: !p.published, image: p.cover ? `/blog/gorsel/${p.cover.id}` : undefined }) : {};
}

export default async function PostPage(props: Props) {
  const p = await loadPost(props);
  if (!p) notFound();
  const category = getBlogCategory(p.category);
  const sector = category?.sectorSlug ? getSector(category.sectorSlug) : undefined;
  const features = p.features.length > 0 ? p.features : (sector?.answers.slice(0, 3).map((a) => a.feature) ?? []);
  const related = (await listPublishedPosts()).filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 3);
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Blog", path: "/blog" }, { name: p.title, path: `/blog/${p.slug}` }])} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.description, datePublished: p.date, inLanguage: "tr-TR", url: `${SITE_URL}/blog/${p.slug}`, ...(p.cover ? { image: `${SITE_URL}/blog/gorsel/${p.cover.id}` } : {}), author: { "@type": "Organization", name: "NeviiHub" }, publisher: { "@type": "Organization", name: "NeviiHub" } }} />
      <PageHero eyebrow={category?.name ?? "Blog"} title={p.title} lead={p.description} crumbs={[{ href: "/blog", label: "Blog" }, ...(category ? [{ href: `/blog/kategori/${category.slug}`, label: category.name }] : [])]}>
        <p className="mt-5 text-sm text-white/70">{dateTr(p.date)} · {p.minutes} dakikalık okuma{p.published ? "" : " · Taslak önizlemesi"}</p>
      </PageHero>
      <article className="mx-auto max-w-[44rem] px-6 py-12">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN'de duran kendi görselimiz; next/image optimizer kotası harcanmaz
          <img src={`/blog/gorsel/${p.cover.id}`} alt={p.cover.alt} width={p.cover.width} height={p.cover.height} className="mb-10 h-auto w-full rounded-2xl" />
        ) : null}
        {parseBlogBody(p.body).map((b, i) =>
          b.type === "h2" ? (
            <h2 key={i} className="mb-4 mt-10 text-2xl first:mt-0">{b.text}</h2>
          ) : b.type === "ul" ? (
            <ul key={i} className="mb-5 list-disc space-y-2 pl-6 text-[17px] leading-relaxed text-slate-800">
              {b.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          ) : (
            <p key={i} className="mb-5 text-[17px] leading-[1.75] text-slate-800">{b.text}</p>
          )
        )}
        {features.length > 0 ? (
          <aside className="mt-10 rounded-2xl bg-[#fbf8f2] p-6 ring-1 ring-amber-900/10">
            <p className="font-semibold text-slate-900">NeviiHub&apos;da bu işin karşılığı</p>
            <ul className="mt-3 space-y-2">
              {features.map((slug) => {
                const f = getFeature(slug);
                return f ? <li key={slug}><Link href={`/ozellikler/${slug}`} className="font-medium text-amber-800 hover:underline">{f.title}</Link></li> : null;
              })}
              {sector ? <li><Link href={`/sektorler/${sector.slug}`} className="font-medium text-amber-800 hover:underline">{sector.name} için NeviiHub</Link></li> : null}
            </ul>
          </aside>
        ) : null}
      </article>
      {related.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <h2 className="text-2xl">Aynı konudan</h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-3">
            {related.map((r, i) => <li key={r.slug}><BlogCard post={r} index={i} /></li>)}
          </ul>
        </section>
      ) : null}
      <LeadBand title="Bunu kurumunuzda birlikte kuralım" source={p.slug} />
    </MarketingShell>
  );
}
