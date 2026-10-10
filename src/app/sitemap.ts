import type { MetadataRoute } from "next";

/** 10. tur iş #3 — herkese açık tek URL anasayfadır (giriş gerektiren rotalar listelenmez). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://neviihub.com";
  return [{ url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
