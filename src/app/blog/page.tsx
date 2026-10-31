import { BlogCard, BlogCategoryNav } from "@/components/site/blog-card";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { breadcrumb, pageMetadata } from "@/lib/marketing/seo";
import { listPublishedPosts } from "@/lib/platform/blog";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "/blog",
  "Blog: Kurs ve Okul Yönetimi Üzerine Yazılar",
  "Müzik okulundan spor salonuna, dil kursundan etüt merkezine: telafi, aidat, kontenjan, veli iletişimi ve öğretmen ödemeleri üzerine işin içinden yazılar."
);

export default async function BlogPage() {
  const posts = await listPublishedPosts();
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <PageHero eyebrow="Blog" title="Kurs işletmenin gündelik meseleleri" lead="Telafi tartışmaları, geciken aidatlar, dolan salonlar, ay sonu hesapları. İşin içinden, sektör sektör." />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <BlogCategoryNav active={null} posts={posts} />
        <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p, i) => (
            <li key={p.slug} className="nh-view-up"><BlogCard post={p} index={i} /></li>
          ))}
        </ul>
      </div>
      <LeadBand title="Kurumunuzda bunları birlikte çözelim" source="blog" />
    </MarketingShell>
  );
}
