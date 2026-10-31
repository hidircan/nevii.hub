/**
 * Blog okuma yolu. Liste yalnız özet satırlarını okur (yazı gövdesi ve görsel baytı taşınmaz) ve önbellektedir;
 * bilinmeyen adresler veritabanına hiç gitmez. Görseller CDN'den döner, veritabanı yalnız ilk istekte okunur.
 */
import { builtinMetas, builtinPost, type BlogPost, type BlogPostMeta } from "../marketing/blog";
import { cachePublic } from "./public-cache";
import { getSettingOverride, listSettingOverridesByKey } from "./store";
import type { SettingScope } from "./types";

/** `brand_asset:*` satırları genel ayar listelerine girmez (store.ts). */
export const BLOG_POST_SCOPE = "brand_asset:blog" as SettingScope;
export const BLOG_IMAGE_SCOPE = "brand_asset:blog_image" as SettingScope;
export const BLOG_META_KEY = "meta";
export const BLOG_BODY_KEY = "body";
export const BLOG_IMAGE_KEY = "file";

async function readStoredMetas(): Promise<BlogPostMeta[]> {
  const rows = await listSettingOverridesByKey(BLOG_POST_SCOPE, BLOG_META_KEY);
  return rows.map((r) => r.value as unknown as BlogPostMeta);
}

const readStoredMetasCached = cachePublic(readStoredMetas, "blog-metas");

/** Hazır yazılar + kayıtlı yazılar; aynı adreste kayıtlı olan kazanır. Yeniden eskiye. */
function mergePosts(stored: BlogPostMeta[]): BlogPostMeta[] {
  const bySlug = new Map(builtinMetas().map((p) => [p.slug, p]));
  for (const p of stored) bySlug.set(p.slug, { ...p, builtin: bySlug.has(p.slug), edited: true });
  return [...bySlug.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function listAllPostsFresh(): Promise<BlogPostMeta[]> {
  return mergePosts(await readStoredMetas());
}

export async function listPublishedPosts(): Promise<BlogPostMeta[]> {
  return mergePosts(await readStoredMetasCached()).filter((p) => p.published);
}

/** Taslak dahil tam yazı (yönetim ve önizleme). */
export async function readPostFresh(slug: string): Promise<BlogPost | null> {
  const [meta, body] = await Promise.all([
    getSettingOverride(BLOG_POST_SCOPE, slug, BLOG_META_KEY),
    getSettingOverride(BLOG_POST_SCOPE, slug, BLOG_BODY_KEY),
  ]);
  const builtin = builtinPost(slug);
  if (!meta) return builtin;
  return { ...(meta.value as unknown as BlogPostMeta), builtin: Boolean(builtin), body: (body?.value as string | undefined) ?? builtin?.body ?? "" };
}

const readPostCached = cachePublic(readPostFresh, "blog-post");

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  if (!(await listPublishedPosts()).some((p) => p.slug === slug)) return null;
  return readPostCached(slug);
}

export async function readBlogImage(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  const row = await getSettingOverride(BLOG_IMAGE_SCOPE, id, BLOG_IMAGE_KEY);
  const data = (row?.value as { data?: string } | undefined)?.data;
  return data ? Buffer.from(data, "base64") : null;
}
