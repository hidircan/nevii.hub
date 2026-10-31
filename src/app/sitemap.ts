import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/marketing/blog";
import { FEATURES } from "@/lib/marketing/features";
import { SECTORS } from "@/lib/marketing/sectors";
import { SITE_URL } from "@/lib/marketing/seo";

/** Giriş gerektiren rotalar ve taslakken noindex olan hukuk metinleri listelenmez. Yeni özellik, sektör veya yazı kendiliğinden eklenir. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly" = "monthly") => ({ url: `${SITE_URL}${path}`, changeFrequency, priority });
  return [
    { ...page("", 1, "weekly"), lastModified: new Date() },
    page("/ozellikler", 0.9, "weekly"),
    page("/sektorler", 0.9, "weekly"),
    page("/blog", 0.7, "weekly"),
    page("/deneme", 0.7),
    page("/hukuk", 0.3, "yearly"),
    page("/gizlilik", 0.3, "yearly"),
    page("/kullanim-kosullari", 0.3, "yearly"),
    ...FEATURES.map((f) => page(`/ozellikler/${f.slug}`, 0.8)),
    ...SECTORS.map((s) => page(`/sektorler/${s.slug}`, 0.8)),
    ...BLOG_POSTS.map((p) => ({ ...page(`/blog/${p.slug}`, 0.6), lastModified: p.date })),
  ];
}
