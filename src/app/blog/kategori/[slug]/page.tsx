import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/link";
import { BlogCard, BlogCategoryNav } from "@/components/site/blog-card";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { getBlogCategory } from "@/lib/marketing/blog";
import { breadcrumb, pageMetadata } from "@/lib/marketing/seo";
import { listPublishedPosts } from "@/lib/platform/blog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = getBlogCategory((await params).slug);
  return c ? pageMetadata(`/blog/kategori/${c.slug}`, `${c.name} Yazıları`, `${c.name} alanında kurum işletenler için program, ödeme, veli iletişimi ve günlük işleyiş üzerine yazılar.`) : {};
}

export default async function BlogCategoryPage({ params }: Props) {
  const c = getBlogCategory((await params).slug);
  if (!c) notFound();
  const all = await listPublishedPosts();
  const posts = all.filter((p) => p.category === c.slug);
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Blog", path: "/blog" }, { name: c.name, path: `/blog/kategori/${c.slug}` }])} />
      <PageHero eyebrow="Blog" title={c.name} lead={`${c.name} alanında kurum işletenler için yazılar.`} crumbs={[{ href: "/blog", label: "Blog" }]} />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <BlogCategoryNav active={c.slug} posts={all} />
        {posts.length > 0 ? (
          <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <li key={p.slug} className="nh-view-up"><BlogCard post={p} index={i} /></li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-slate-600">Bu kategoride henüz yazı yok. <Link href="/blog" className="font-medium text-amber-800 underline">Tüm yazılara dönün</Link>.</p>
        )}
      </div>
      <LeadBand title={`${c.name} kurumunuz için konuşalım`} source={`blog-${c.slug}`} />
    </MarketingShell>
  );
}
