import { createHash } from "node:crypto";
import { z } from "zod";
import { BLOG_CATEGORIES, descriptionFromBody, readingMinutes, slugifyTitle, type BlogCover, type BlogPostMeta } from "../marketing/blog";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { requireHyperAdmin } from "./access";
import { BLOG_BODY_KEY, BLOG_IMAGE_KEY, BLOG_IMAGE_SCOPE, BLOG_META_KEY, BLOG_POST_SCOPE, listAllPostsFresh, readPostFresh } from "./blog";
import { validateLogoUpload } from "./branding";
import { invalidatePublicSite } from "./public-cache";
import { appendPlatformAudit, deleteSettingOverride, upsertSettingOverride } from "./store";
import type { JsonValue } from "./types";

const COVER_MAX_WIDTH = 1600;
const COVER_MAX_HEIGHT = 1000;
/** Bu sınır kotayı öngörülebilir kılar: görsel ne kadar büyük gelirse gelsin küçülür. */
const COVER_MAX_BYTES = 300 * 1024;

const saveSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,100}$/).nullable().optional(),
  title: z.string().trim().min(5, "Başlık en az 5 karakter olmalı.").max(140, "Başlık en fazla 140 karakter olabilir."),
  description: z.string().trim().max(300, "Kısa özet en fazla 300 karakter olabilir.").optional(),
  category: z.string().refine((c) => BLOG_CATEGORIES.some((x) => x.slug === c), "Listeden bir kategori seçin."),
  body: z.string().trim().min(200, "Yazı en az 200 karakter olmalı.").max(60000, "Yazı en fazla 60.000 karakter olabilir."),
  published: z.boolean(),
  coverAlt: z.string().trim().max(160, "Görsel açıklaması en fazla 160 karakter olabilir.").optional(),
  coverMime: z.string().max(40).optional(),
  coverBase64: z.string().max(4_200_000, "Görsel en fazla 3 MB olabilir. Dosyayı küçültüp tekrar yükleyin.").optional(),
  removeCover: z.boolean().optional(),
});

async function encodeCover(input: Buffer) {
  const sharp = (await import("sharp")).default;
  const encode = (quality: number) =>
    sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(COVER_MAX_WIDTH, COVER_MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
  const first = await encode(78);
  return first.data.length <= COVER_MAX_BYTES ? first : encode(55);
}

async function audit(ctx: ServiceContext, action: string, slug: string, before: unknown, after: unknown) {
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action,
    entityType: "BlogPost",
    entityId: slug,
    before: before as never,
    after: after as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
}

/** Görsel başka bir yazıda kullanılmıyorsa satırı silinir; öksüz bayt birikmez. */
async function dropCoverIfUnused(cover: BlogCover | null | undefined, others: BlogPostMeta[]) {
  if (cover && !others.some((p) => p.cover?.id === cover.id)) {
    await deleteSettingOverride(BLOG_IMAGE_SCOPE, cover.id, BLOG_IMAGE_KEY);
  }
}

export async function listBlogAdmin(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  return ok({ posts: await listAllPostsFresh() });
}

export async function readBlogAdmin(ctx: ServiceContext, slug: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const post = typeof slug === "string" ? await readPostFresh(slug) : null;
  return post ? ok({ post }) : fail("NOT_FOUND", "Yazı bulunamadı; silinmiş olabilir. Listeyi yenileyip tekrar deneyin.");
}

export async function saveBlogPost(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Yazı kaydedilemedi; alanları kontrol edin.");
  const v = parsed.data;
  const all = await listAllPostsFresh();
  const existing = v.slug ? all.find((p) => p.slug === v.slug) : undefined;
  if (v.slug && !existing) return fail("NOT_FOUND", "Düzenlediğiniz yazı bulunamadı; silinmiş olabilir. Metninizi kopyalayıp yeni yazı olarak kaydedin.");

  let slug = v.slug ?? slugifyTitle(v.title);
  if (!slug) return fail("VALIDATION_ERROR", "Başlıktan adres üretilemedi. Başlığa harf veya rakam ekleyin.");
  if (!v.slug) {
    const base = slug;
    for (let n = 2; all.some((p) => p.slug === slug); n++) slug = `${base}-${n}`;
  }

  const now = new Date().toISOString();
  let cover: BlogCover | null = v.removeCover ? null : (existing?.cover ?? null);
  if (v.coverBase64 && v.coverMime) {
    const valid = validateLogoUpload(v.coverMime, v.coverBase64, "Görsel");
    if (!valid.ok) return fail("VALIDATION_ERROR", valid.message);
    const encoded = await encodeCover(valid.bytes).catch(() => null);
    if (!encoded) return fail("VALIDATION_ERROR", "Görsel işlenemedi. Dosya bozuk olabilir; PNG, JPEG ya da WebP olarak yeniden kaydedip tekrar yükleyin.");
    const id = createHash("sha256").update(encoded.data).digest("hex").slice(0, 16);
    await upsertSettingOverride({ scopeType: BLOG_IMAGE_SCOPE, scopeId: id, key: BLOG_IMAGE_KEY, value: { data: encoded.data.toString("base64") }, updatedAt: now, updatedBy: ctx.userId });
    cover = { id, width: encoded.info.width, height: encoded.info.height, size: encoded.data.length, alt: "" };
  }
  if (cover) cover = { ...cover, alt: v.coverAlt || v.title };

  const meta: BlogPostMeta = {
    slug,
    title: v.title,
    description: v.description || descriptionFromBody(v.body),
    category: v.category,
    // Yayın tarihi ilk yayında konur.
    date: v.published && !existing?.published ? now.slice(0, 10) : (existing?.date ?? now.slice(0, 10)),
    minutes: readingMinutes(v.body),
    cover,
    published: v.published,
    features: existing?.features ?? [],
    builtin: existing?.builtin ?? false,
  };
  // Önce gövde, sonra özet: yarım kayıtta eski yazı yayında kalır.
  await upsertSettingOverride({ scopeType: BLOG_POST_SCOPE, scopeId: slug, key: BLOG_BODY_KEY, value: v.body, updatedAt: now, updatedBy: ctx.userId });
  await upsertSettingOverride({ scopeType: BLOG_POST_SCOPE, scopeId: slug, key: BLOG_META_KEY, value: meta as unknown as JsonValue, updatedAt: now, updatedBy: ctx.userId });
  if (existing?.cover?.id !== cover?.id) await dropCoverIfUnused(existing?.cover, all.filter((p) => p.slug !== slug));
  await audit(ctx, "platform.blog.save", slug, existing ?? null, meta);
  invalidatePublicSite();
  return ok({ post: meta });
}

/** Yayınla / yayından kaldır: metne dokunmaz. Hazır yazıda düzenleme satırı burada oluşur. */
export async function setBlogPublished(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = z.object({ slug: z.string().min(1).max(100), published: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Yazı seçilemedi. Listeyi yenileyip tekrar deneyin.");
  const post = await readPostFresh(parsed.data.slug);
  if (!post) return fail("NOT_FOUND", "Yazı bulunamadı; silinmiş olabilir. Listeyi yenileyip tekrar deneyin.");
  const { body, ...before } = post;
  const now = new Date().toISOString();
  const meta: BlogPostMeta = { ...before, published: parsed.data.published, date: parsed.data.published && !before.published ? now.slice(0, 10) : before.date };
  await upsertSettingOverride({ scopeType: BLOG_POST_SCOPE, scopeId: post.slug, key: BLOG_BODY_KEY, value: body, updatedAt: now, updatedBy: ctx.userId });
  await upsertSettingOverride({ scopeType: BLOG_POST_SCOPE, scopeId: post.slug, key: BLOG_META_KEY, value: meta as unknown as JsonValue, updatedAt: now, updatedBy: ctx.userId });
  await audit(ctx, "platform.blog.save", post.slug, before, meta);
  invalidatePublicSite();
  return ok({ post: meta });
}

/** Kendi yazısı tamamen silinir; hazır yazı ilk hâline döner. */
export async function deleteBlogPost(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const slug = z.object({ slug: z.string().min(1).max(100) }).safeParse(input);
  if (!slug.success) return fail("VALIDATION_ERROR", "Yazı seçilemedi. Listeyi yenileyip tekrar deneyin.");
  const all = await listAllPostsFresh();
  const post = all.find((p) => p.slug === slug.data.slug);
  if (!post) return fail("NOT_FOUND", "Yazı bulunamadı; silinmiş olabilir. Listeyi yenileyip tekrar deneyin.");
  await deleteSettingOverride(BLOG_POST_SCOPE, post.slug, BLOG_META_KEY);
  await deleteSettingOverride(BLOG_POST_SCOPE, post.slug, BLOG_BODY_KEY);
  await dropCoverIfUnused(post.cover, all.filter((p) => p.slug !== post.slug));
  await audit(ctx, "platform.blog.delete", post.slug, post, null);
  invalidatePublicSite();
  return ok({ slug: post.slug });
}
