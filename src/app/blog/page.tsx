import Link from "@/components/link";
import { JsonLd, LeadBand, MarketingShell, PageHero } from "@/components/site/marketing-shell";
import { BLOG_POSTS } from "@/lib/marketing/blog";
import { breadcrumb, pageMetadata } from "@/lib/marketing/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "/blog",
  "Blog: Eğitim Kurumu Yönetimi Rehberleri",
  "Müzik okulu, dans, pilates, dil kursu, etüt merkezi ve spor akademileri için program, yoklama, tahsilat ve KVKK rehberleri."
);

export default function BlogPage() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumb([{ name: "Ana sayfa", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <PageHero eyebrow="Blog" title="Eğitim kurumu yönetimine dair pratik rehberler" lead="Kurumunuzu daha düzenli yönetmek için sektörünüze özel öneriler." />
      <ul className="mx-auto grid max-w-6xl gap-5 px-6 py-16 md:grid-cols-2 lg:grid-cols-3">
        {BLOG_POSTS.map((p, i) => (
          <li key={p.slug} className="nh-view-up">
            <Link href={`/blog/${p.slug}`} className="nh-lift flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 shadow-sm hover:border-amber-300">
              <span aria-hidden className="flex h-32 items-end p-4 text-sm font-bold text-white" style={{ background: `linear-gradient(${120 + i * 24}deg, #5c3d00, #a56a00 60%, #d97706)` }}>{p.sector}</span>
              <span className="flex flex-1 flex-col p-5">
                <span className="font-semibold leading-snug text-slate-900">{p.title}</span>
                <span className="mt-2 text-sm leading-relaxed text-slate-600">{p.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <LeadBand title="Okumak güzel, görmek daha güzel" source="blog" />
    </MarketingShell>
  );
}
