import type { MetadataRoute } from "next";

/** 10. tur iş #3 — arama motorlarına açık tek sayfa anasayfadır; panel/API taranmaz. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://neviihub.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/panel/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
