import Link from "@/components/link";
import { BLOG_CATEGORIES, getBlogCategory, type BlogPostMeta } from "@/lib/marketing/blog";

/** Görseli olmayan yazıda kategori rengiyle kapak: kota ve dosya gerektirmez. */
export function BlogCard({ post, index }: { post: BlogPostMeta; index: number }) {
  const category = getBlogCategory(post.category)?.name ?? post.category;
  return (
    <Link href={`/blog/${post.slug}`} className="nh-lift flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 shadow-sm hover:border-amber-300">
      {post.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN'de duran kendi görselimiz; next/image optimizer kotası harcanmaz
        <img src={`/blog/gorsel/${post.cover.id}`} alt={post.cover.alt} width={post.cover.width} height={post.cover.height} loading="lazy" className="h-40 w-full object-cover" />
      ) : (
        <span aria-hidden className="block h-24" style={{ background: `linear-gradient(${120 + index * 24}deg, #5c3d00, #a56a00 60%, #d97706)` }} />
      )}
      <span className="flex flex-1 flex-col p-5">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-700">{category}</span>
        <span className="mt-2 font-semibold leading-snug text-slate-900">{post.title}</span>
        <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{post.description}</span>
        <span className="mt-3 text-xs text-slate-500">{post.minutes} dakikalık okuma</span>
      </span>
    </Link>
  );
}

export function BlogCategoryNav({ active, posts }: { active: string | null; posts: BlogPostMeta[] }) {
  const used = new Set(posts.map((p) => p.category));
  const chip = (on: boolean) => `rounded-full px-4 py-2 text-sm font-medium ${on ? "bg-[#5c3d00] text-white" : "border border-slate-300 text-slate-700 hover:bg-amber-50"}`;
  return (
    <nav aria-label="Kategoriler" className="flex flex-wrap gap-2">
      <Link href="/blog" className={chip(active === null)}>Tümü</Link>
      {BLOG_CATEGORIES.filter((c) => used.has(c.slug)).map((c) => (
        <Link key={c.slug} href={`/blog/kategori/${c.slug}`} className={chip(active === c.slug)}>{c.name}</Link>
      ))}
    </nav>
  );
}
