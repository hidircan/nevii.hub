import type { MetadataRoute } from "next";

/** Kurumsal site taranır; panel/API taranmaz. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://neviihub.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/panel/", "/platform/", "/ogretmen/", "/ogrenci/", "/veli/", "/sube/", "/login", "/abonelik/", "/satin-al/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
