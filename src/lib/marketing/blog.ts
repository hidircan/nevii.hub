/**
 * Blog ortak tanımları. Hazır yazılar `blog-posts/` altında kodda durur; NeviiOS'tan yazılanlar ve hazır yazılara
 * yapılan düzenlemeler `platform/blog.ts` ile veritabanından okunur. Metin biçimi düz yazıdır, HTML kabul edilmez:
 * boş satır paragraf, `## ` alt başlık, `- ` madde.
 */
import { BUILTIN_POSTS } from "./blog-posts";

export type BlogCategory = { slug: string; name: string; sectorSlug: string | null };

export const BLOG_CATEGORIES: BlogCategory[] = [
  { slug: "muzik", name: "Müzik", sectorSlug: "muzik-okulu-yazilimi" },
  { slug: "dans-bale", name: "Dans ve Bale", sectorSlug: "dans-bale-okulu-yazilimi" },
  { slug: "yoga-pilates", name: "Yoga ve Pilates", sectorSlug: "yoga-pilates-studyosu-yazilimi" },
  { slug: "dil-kursu", name: "Dil Kursu", sectorSlug: "dil-kursu-yazilimi" },
  { slug: "etut-dershane", name: "Etüt ve Dershane", sectorSlug: "etut-merkezi-dershane-yazilimi" },
  { slug: "spor", name: "Spor", sectorSlug: "spor-akademisi-yazilimi" },
  { slug: "sanat", name: "Sanat", sectorSlug: "sanat-atolyesi-yazilimi" },
  { slug: "kodlama-robotik", name: "Kodlama ve Robotik", sectorSlug: "kodlama-robotik-kursu-yazilimi" },
  { slug: "ozel-ders-kocluk", name: "Özel Ders ve Koçluk", sectorSlug: "ozel-ders-kocluk-yazilimi" },
  { slug: "kurum-yonetimi", name: "Kurum Yönetimi", sectorSlug: null },
];

export const getBlogCategory = (slug: string) => BLOG_CATEGORIES.find((c) => c.slug === slug);

export type BlogCover = { id: string; width: number; height: number; size: number; alt: string };

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  category: string;
  date: string;
  minutes: number;
  cover: BlogCover | null;
  published: boolean;
  features: string[];
  /** Kodda hazır gelen yazı; silinemez, yayından kaldırılır veya hazır hâline döndürülür. */
  builtin: boolean;
  /** Veritabanında kaydı var (hazır yazıda: düzenlenmiş). */
  edited?: boolean;
};

export type BlogPost = BlogPostMeta & { body: string };

export type BuiltinPost = { slug: string; title: string; description: string; category: string; features: string[]; body: string };

/** Hazır yazıların yayın tarihi. */
const BUILTIN_DATE = "2026-10-31";

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 200));
}

const metaOf = ({ body, ...p }: BuiltinPost): BlogPostMeta => ({ ...p, date: BUILTIN_DATE, minutes: readingMinutes(body), cover: null, published: true, builtin: true });

export function builtinPost(slug: string): BlogPost | null {
  const p = BUILTIN_POSTS.find((x) => x.slug === slug);
  return p ? { ...metaOf(p), body: p.body } : null;
}

export const builtinMetas = (): BlogPostMeta[] => BUILTIN_POSTS.map(metaOf);

export type BlogBlock = { type: "h2"; text: string } | { type: "p"; text: string } | { type: "ul"; items: string[] };

/** Düz metni bloklara ayırır; çıktı React ile basılır, içerik HTML olarak yorumlanmaz. */
export function parseBlogBody(body: string): BlogBlock[] {
  const blocks: BlogBlock[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({ type: "ul", items: lines.map((l) => l.slice(2).trim()) });
    } else if (lines[0]!.startsWith("## ")) {
      blocks.push({ type: "h2", text: lines[0]!.slice(3).trim() });
      if (lines.length > 1) blocks.push({ type: "p", text: lines.slice(1).join(" ") });
    } else {
      blocks.push({ type: "p", text: lines.join(" ") });
    }
  }
  return blocks;
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

export function slugifyTitle(title: string): string {
  return title
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => TR_MAP[c]!)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** Özet girilmediyse ilk paragraftan arama sonucu açıklaması türetilir. */
export function descriptionFromBody(body: string): string {
  const first = parseBlogBody(body).find((b) => b.type === "p");
  const text = first?.type === "p" ? first.text : "";
  return text.length > 155 ? `${text.slice(0, 152).replace(/\s+\S*$/, "")}…` : text;
}
