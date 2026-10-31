import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://neviihub.com";

/** Tutarlı başlık, açıklama, canonical ve paylaşım kartı. */
export function pageMetadata(path: string, title: string, description: string, opts?: { keywords?: string[]; noindex?: boolean; type?: "website" | "article" }): Metadata {
  const full = `${title} | NeviiHub`;
  return {
    title: full,
    description,
    keywords: opts?.keywords,
    alternates: { canonical: path },
    robots: opts?.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: full, description, url: path, type: opts?.type ?? "website", siteName: "NeviiHub", locale: "tr_TR", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "NeviiHub" }] },
    twitter: { card: "summary_large_image", title: full, description, images: ["/opengraph-image"] },
  };
}

export function breadcrumb(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}
