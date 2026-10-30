import { cache } from "react";
import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { getSiteContent, SITE_DEFAULT_LINKS, type SiteContent, type SiteLinkKey, type SiteLocale } from "../site-locales";
import { requireHyperAdmin } from "./access";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { resolveSiteContent } from "./site-content-overrides";
import { appendPlatformAudit, getSettingOverride, upsertSettingOverride } from "./store";
import type { JsonValue } from "./types";

/**
 * Ana sayfa yapısı — bölüm sırası/görünürlüğü, düğme hedefleri, iletişim ve
 * liste içerikleri (menü, özellikler, SSS…). Tek metinler `site-content-overrides.ts`,
 * fiyat katalogda, logo Platform Markası'nda, hukuki metin belge yönetimindedir:
 * burada kopyaları tutulmaz.
 * Platform kapsamında tek satırdır (`site.page`); kayıt anında yayındadır (taslak yok).
 */
export const SITE_PAGE_KEY = "site.page";

export const SITE_SECTIONS = [
  { id: "about", label: "Hakkında", anchor: "hakkimizda" },
  { id: "stats", label: "Canlı rakamlar", anchor: "rakamlar" },
  { id: "start", label: "Başlangıç adımları", anchor: "nasil-baslarsiniz" },
  { id: "features", label: "Özellikler", anchor: "ozellikler" },
  { id: "platform", label: "Platform tanıtımı", anchor: "platform" },
  { id: "references", label: "Referanslar", anchor: "referanslar" },
  { id: "pricing", label: "Paketler ve fiyatlar", anchor: "fiyatlandirma" },
  { id: "purchase", label: "Nasıl satın alınır", anchor: "satin-alma" },
  { id: "mobile", label: "Mobil uygulama", anchor: "mobil-uygulama" },
  { id: "media", label: "Tanıtım görselleri", anchor: "medya" },
  { id: "faq", label: "Sıkça sorulan sorular", anchor: "sss" },
  { id: "contact", label: "İletişim", anchor: "iletisim" },
] as const;

export type SiteSectionId = (typeof SITE_SECTIONS)[number]["id"];

const SECTION_IDS = SITE_SECTIONS.map((s) => s.id) as SiteSectionId[];
/** Referanslar gerçek kurum eklenene kadar kapalı başlar; satır yokken de bu geçerlidir. */
const DEFAULT_HIDDEN: SiteSectionId[] = ["references"];
/** Satın alma ekranları `/#fiyatlandirma`ya döner; bu bölüm kapatılamaz. */
export const ALWAYS_VISIBLE: SiteSectionId[] = ["pricing"];

export const SITE_LINK_FIELDS: { key: SiteLinkKey; label: string }[] = [
  { key: "headerDemo", label: "Üst menü: Demo düğmesi" },
  { key: "headerLogin", label: "Üst menü: Giriş düğmesi" },
  { key: "heroLogin", label: "Karşılama: Giriş düğmesi" },
  { key: "heroTrial", label: "Karşılama: Deneme düğmesi" },
  { key: "heroTour", label: "Karşılama: Tanıtım bağlantısı" },
  { key: "contactTrial", label: "İletişim: Deneme düğmesi" },
  { key: "pricingPlaceholder", label: "Fiyatlandırma: Yer tutucu düğmesi" },
  { key: "purchaseCta", label: "Satın alma: Paket bağlantısı" },
];

export type ListFieldKind = "text" | "multiline" | "lines" | "link" | "path";
export type ListField = { key: string; label: string; kind: ListFieldKind; required?: boolean };
export type SiteListKey = "nav" | "highlights" | "startSteps" | "groups" | "surfaces" | "steps" | "referenceItems" | "mediaItems" | "faqItems";
export type ListDef = { key: SiteListKey; label: string; help?: string; max: number; fields: ListField[] };
export type ListRow = Record<string, string | string[]>;

const titled: ListField[] = [
  { key: "title", label: "Başlık", kind: "text", required: true },
  { key: "description", label: "Açıklama", kind: "multiline", required: true },
];

export const SITE_LIST_DEFS: ListDef[] = [
  { key: "nav", label: "Üst menü ve alt menü", help: "Kapalı bölüme giden öğeler otomatik gizlenir.", max: 12, fields: [
    { key: "label", label: "Metin", kind: "text", required: true },
    { key: "href", label: "Hedef", kind: "link", required: true },
  ] },
  { key: "highlights", label: "Karşılama öne çıkanları", max: 8, fields: [{ key: "text", label: "Metin", kind: "text", required: true }] },
  { key: "startSteps", label: "Başlangıç adımları", max: 6, fields: titled },
  { key: "groups", label: "Özellik grupları", max: 12, fields: [...titled, { key: "points", label: "Maddeler (her satıra bir tane)", kind: "lines" }] },
  { key: "surfaces", label: "Platform tanıtımı", help: "Görsel anlatım en fazla üç kartı destekler.", max: 3, fields: [...titled, { key: "points", label: "Maddeler (her satıra bir tane)", kind: "lines" }] },
  { key: "steps", label: "Satın alma adımları", max: 8, fields: titled },
  { key: "referenceItems", label: "Referanslar", help: "Yalnız gerçek kurumları, izin aldıktan sonra ekleyin.", max: 24, fields: [
    { key: "name", label: "Kurum adı", kind: "text", required: true },
    { key: "sector", label: "Sektör", kind: "text" },
    { key: "quote", label: "Kısa metin", kind: "multiline" },
    { key: "logoUrl", label: "Logo dosya yolu (sitedeki bir dosya, ör. /brand/x.png)", kind: "path" },
    { key: "logoAlt", label: "Logo açıklaması", kind: "text" },
    { key: "storyHref", label: "Hikâye bağlantısı", kind: "link" },
  ] },
  { key: "mediaItems", label: "Tanıtım görselleri", help: "Yalnız sitede bulunan dosya yolları çalışır; buradan dosya yüklenmez. Öğe yoksa bölüm görünmez.", max: 8, fields: [
    { key: "title", label: "Başlık", kind: "text", required: true },
    { key: "caption", label: "Alt yazı", kind: "text" },
    { key: "imageUrl", label: "Görsel dosya yolu", kind: "path" },
    { key: "imageAlt", label: "Görsel açıklaması", kind: "text" },
    { key: "videoUrl", label: "Video dosya yolu", kind: "path" },
  ] },
  { key: "faqItems", label: "Sıkça sorulan sorular", max: 40, fields: [
    { key: "question", label: "Soru", kind: "text", required: true },
    { key: "answer", label: "Yanıt", kind: "multiline", required: true },
  ] },
];

const DEF_BY_KEY = new Map(SITE_LIST_DEFS.map((d) => [d.key, d]));
const LOCALES: SiteLocale[] = ["tr", "en", "de", "fr", "es"];
/** Kodda varsayılanı olmayan, kuruma özel listeler: çevirisi yoksa Türkçesi gösterilir. */
const FALLS_BACK_TO_TR: SiteListKey[] = ["referenceItems", "mediaItems"];
const MAX_TOTAL_CHARS = 150_000;

const KNOWN_ANCHORS = new Set<string>(["ust", ...SITE_SECTIONS.map((s) => s.anchor)]);

/** Yalnız sayfa içi çapa, site içi yol, https, mailto ve tel. javascript:, data: vb. asla. */
export function safeSiteHref(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 300 || /[\s\\\u0000-\u001f]/.test(v)) return null;
  if (v.startsWith("#")) return KNOWN_ANCHORS.has(v.slice(1)) ? v : null;
  if (v.startsWith("/")) return v.startsWith("//") ? null : v;
  if (/^mailto:[^@]+@[^@]+$/i.test(v) || /^tel:\+?[0-9-]+$/i.test(v)) return v;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** Görseller CSP gereği yalnız kendi alan adından yüklenir. */
function safeSitePath(raw: string): string | null {
  const v = raw.trim();
  return /^\/(?!\/)[A-Za-z0-9._~\-/]+$/.test(v) && !v.includes("..") ? v : null;
}

const FIELD_LIMIT: Record<ListFieldKind, number> = { text: 200, multiline: 1200, lines: 300, link: 300, path: 300 };
const FIELD_HINT: Partial<Record<ListFieldKind, string>> = {
  link: "#iletisim, /deneme, https://…, mailto: veya tel: biçiminde olmalı",
  path: "sitedeki bir dosya yolu olmalı (ör. /brand/logo.png)",
};

/** Yazarken de okurken de aynı süzgeç: bozuk kayıt yayına sızmaz. */
function sanitizeRows(def: ListDef, raw: unknown): { ok: true; rows: ListRow[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: `${def.label}: geçersiz liste.` };
  if (raw.length > def.max) return { ok: false, message: `${def.label}: en fazla ${def.max} öğe eklenebilir.` };
  const rows: ListRow[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `${def.label}, ${i + 1}. öğe`;
    if (typeof item !== "object" || item === null) return { ok: false, message: `${at}: geçersiz.` };
    const src = item as Record<string, unknown>;
    const row: ListRow = {};
    for (const f of def.fields) {
      const value = src[f.key];
      if (f.kind === "lines") {
        const lines = (Array.isArray(value) ? value : []).map((l) => String(l).trim()).filter(Boolean);
        if (lines.length > 12) return { ok: false, message: `${at}: “${f.label}” en fazla 12 satır olabilir.` };
        if (lines.some((l) => l.length > FIELD_LIMIT.lines)) return { ok: false, message: `${at}: “${f.label}” satırı çok uzun.` };
        row[f.key] = lines;
        continue;
      }
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) {
        if (f.required) return { ok: false, message: `${at}: “${f.label}” boş bırakılamaz.` };
        continue;
      }
      if (text.length > FIELD_LIMIT[f.kind]) return { ok: false, message: `${at}: “${f.label}” en fazla ${FIELD_LIMIT[f.kind]} karakter olabilir.` };
      const clean = f.kind === "link" ? safeSiteHref(text) : f.kind === "path" ? safeSitePath(text) : text;
      if (!clean) return { ok: false, message: `${at}: “${f.label}” ${FIELD_HINT[f.kind]}.` };
      row[f.key] = clean;
    }
    rows.push(row);
  }
  return { ok: true, rows };
}

type ListBucket = Partial<Record<SiteListKey, ListRow[]>>;

export type SitePageSettings = {
  order: SiteSectionId[];
  hidden: SiteSectionId[];
  links: Partial<Record<SiteLinkKey, string>>;
  contact: { email?: string; phone?: string; address?: string };
  heroShowcase: { imageUrl: string; imageAlt: string; caption: string } | null;
  lists: Partial<Record<SiteLocale, ListBucket>>;
};

function normalizeSettings(value: unknown): SitePageSettings {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const isSection = (x: unknown): x is SiteSectionId => SECTION_IDS.includes(x as SiteSectionId);
  const saved = Array.isArray(v.order) ? v.order.filter(isSection) : [];
  // Yeni eklenen bölüm kayıtlı sıranın sonuna değil, varsayılan yerine (önceki komşusunun arkasına) girer.
  const order = [...new Set(saved)];
  SECTION_IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const after = i === 0 ? -1 : order.indexOf(SECTION_IDS[i - 1]!);
    order.splice(after + 1, 0, id);
  });
  const hidden = (Array.isArray(v.hidden) ? v.hidden.filter(isSection) : DEFAULT_HIDDEN).filter((id) => !ALWAYS_VISIBLE.includes(id));

  const links: SitePageSettings["links"] = {};
  const rawLinks = (v.links ?? {}) as Record<string, unknown>;
  for (const { key } of SITE_LINK_FIELDS) {
    const href = typeof rawLinks[key] === "string" ? safeSiteHref(rawLinks[key] as string) : null;
    if (href) links[key] = href;
  }

  const rawContact = (v.contact ?? {}) as Record<string, unknown>;
  const contact: SitePageSettings["contact"] = {};
  for (const k of ["email", "phone", "address"] as const) {
    if (typeof rawContact[k] === "string" && (rawContact[k] as string).trim()) contact[k] = (rawContact[k] as string).trim();
  }

  const rawShowcase = (v.heroShowcase ?? null) as Record<string, unknown> | null;
  const imageUrl = typeof rawShowcase?.imageUrl === "string" ? safeSitePath(rawShowcase.imageUrl) : null;
  const heroShowcase = imageUrl
    ? { imageUrl, imageAlt: String(rawShowcase?.imageAlt ?? ""), caption: String(rawShowcase?.caption ?? "") }
    : null;

  const lists: SitePageSettings["lists"] = {};
  const rawLists = (v.lists ?? {}) as Record<string, Record<string, unknown>>;
  for (const locale of LOCALES) {
    for (const def of SITE_LIST_DEFS) {
      const raw = rawLists[locale]?.[def.key];
      if (raw === undefined) continue;
      const clean = sanitizeRows(def, raw);
      if (clean.ok) (lists[locale] ??= {})[def.key] = clean.rows;
    }
  }
  return { order, hidden, links, contact, heroShowcase, lists };
}

/** İstek başına tek okuma. */
export const getSitePageSettings = cache(async function getSitePageSettings(): Promise<SitePageSettings> {
  return normalizeSettings((await getSettingOverride("platform", "*", SITE_PAGE_KEY))?.value);
});

/** Düzenleyicinin göstereceği satırlar: koddaki içerik satır biçiminde. */
export function listRowsFromContent(c: SiteContent, key: SiteListKey): ListRow[] {
  if (key === "highlights") return c.hero.highlights.map((text) => ({ text }));
  return (c[key] as unknown as ListRow[]).map((row) => ({ ...row }));
}

function applyList(c: SiteContent, key: SiteListKey, rows: ListRow[]) {
  if (key === "highlights") c.hero.highlights = rows.map((r) => String(r.text));
  else (c as unknown as Record<string, unknown>)[key] = rows;
}

export type SitePage = { c: SiteContent; sections: SiteSectionId[] };

/** Etkin sayfa: kod varsayılanı + metin düzenlemeleri + yapı ayarları. */
export const resolveSitePage = cache(async function resolveSitePage(locale: SiteLocale): Promise<SitePage> {
  const [base, settings] = await Promise.all([resolveSiteContent(locale), getSitePageSettings()]);
  const c = structuredClone(base);
  for (const def of SITE_LIST_DEFS) {
    const rows = settings.lists[locale]?.[def.key] ?? (FALLS_BACK_TO_TR.includes(def.key) ? settings.lists.tr?.[def.key] : undefined);
    if (rows) applyList(c, def.key, rows);
  }
  c.contactInfo = { ...c.contactInfo, ...settings.contact };
  if (settings.heroShowcase) c.heroShowcase = settings.heroShowcase;

  const hiddenAnchors = new Set<string>(SITE_SECTIONS.filter((s) => settings.hidden.includes(s.id)).map((s) => s.anchor));
  const pointsToHidden = (href: string) => {
    const hash = href.startsWith("#") ? href.slice(1) : href.startsWith("/#") ? href.slice(2) : null;
    return hash !== null && hiddenAnchors.has(hash);
  };
  c.nav = c.nav.filter((item) => !pointsToHidden(item.href));
  c.links = Object.fromEntries(
    SITE_LINK_FIELDS.map(({ key }) => {
      const href = settings.links[key] ?? SITE_DEFAULT_LINKS[key];
      return [key, pointsToHidden(href) ? null : href];
    })
  ) as SiteContent["links"];
  return { c, sections: settings.order.filter((id) => !settings.hidden.includes(id)) };
});

/** NeviiOS düzenleyicisinin başlangıç verisi. */
export async function getSitePageMeta(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const defaults = Object.fromEntries(
    LOCALES.map((l) => [l, Object.fromEntries(SITE_LIST_DEFS.map((d) => [d.key, listRowsFromContent(getSiteContent(l), d.key)]))])
  ) as Record<SiteLocale, Record<SiteListKey, ListRow[]>>;
  return ok({ settings: await getSitePageSettings(), defaults });
}

const inputSchema = z.object({
  layout: z.object({ order: z.array(z.string()).max(30), hidden: z.array(z.string()).max(30) }).optional(),
  links: z.record(z.string(), z.string().max(300)).optional(),
  contact: z.object({ email: z.string().max(200), phone: z.string().max(40), address: z.string().max(300) }).optional(),
  heroShowcase: z.object({ imageUrl: z.string().max(300), imageAlt: z.string().max(200), caption: z.string().max(200) }).nullable().optional(),
  list: z.object({ locale: z.enum(["tr", "en", "de", "fr", "es"]), key: z.string(), rows: z.array(z.unknown()).nullable() }).optional(),
});

export async function setSitePage(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Site ayarı geçersiz; alanları kontrol edip tekrar kaydedin.");
  const { layout, links, contact, heroShowcase, list } = parsed.data;
  const before = normalizeSettings((await getSettingOverride("platform", "*", SITE_PAGE_KEY))?.value);
  const next: SitePageSettings = structuredClone(before);

  if (layout) {
    if ([...layout.order, ...layout.hidden].some((id) => !SECTION_IDS.includes(id as SiteSectionId))) {
      return fail("VALIDATION_ERROR", "Bilinmeyen bölüm gönderildi; sayfayı yenileyip tekrar deneyin.");
    }
    if (layout.hidden.some((id) => ALWAYS_VISIBLE.includes(id as SiteSectionId))) {
      return fail("VALIDATION_ERROR", "Paketler ve fiyatlar bölümü kapatılamaz; satın alma ekranları bu bölüme döner.");
    }
    next.order = layout.order as SiteSectionId[];
    next.hidden = layout.hidden as SiteSectionId[];
  }
  if (links) {
    next.links = {};
    for (const { key, label } of SITE_LINK_FIELDS) {
      const raw = links[key]?.trim();
      if (!raw) continue;
      const href = safeSiteHref(raw);
      if (!href) return fail("VALIDATION_ERROR", `“${label}” hedefi ${FIELD_HINT.link}.`);
      next.links[key] = href;
    }
  }
  if (contact) {
    if (contact.email.trim() && !z.string().email().safeParse(contact.email.trim()).success) {
      return fail("VALIDATION_ERROR", "İletişim e-postası geçerli bir adres olmalı; boş bırakırsanız varsayılan adres kullanılır.");
    }
    if (contact.phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(contact.phone.trim())) {
      return fail("VALIDATION_ERROR", "İletişim telefonu yalnız rakam, boşluk, +, - ve parantez içermeli (ör. +90 232 000 00 00).");
    }
    next.contact = {
      ...(contact.email.trim() ? { email: contact.email.trim() } : {}),
      ...(contact.phone.trim() ? { phone: contact.phone.trim().replace(/[ ()]/g, "") } : {}),
      ...(contact.address.trim() ? { address: contact.address.trim() } : {}),
    };
  }
  if (heroShowcase !== undefined) {
    if (heroShowcase === null || !heroShowcase.imageUrl.trim()) next.heroShowcase = null;
    else {
      const imageUrl = safeSitePath(heroShowcase.imageUrl);
      if (!imageUrl) return fail("VALIDATION_ERROR", `Karşılama görseli ${FIELD_HINT.path}.`);
      next.heroShowcase = { imageUrl, imageAlt: heroShowcase.imageAlt.trim(), caption: heroShowcase.caption.trim() };
    }
  }
  if (list) {
    const def = DEF_BY_KEY.get(list.key as SiteListKey);
    if (!def) return fail("VALIDATION_ERROR", "Bilinmeyen liste gönderildi; sayfayı yenileyip tekrar deneyin.");
    const bucket: ListBucket = { ...(next.lists[list.locale] ?? {}) };
    if (list.rows === null) delete bucket[def.key];
    else {
      const clean = sanitizeRows(def, list.rows);
      if (!clean.ok) return fail("VALIDATION_ERROR", clean.message);
      bucket[def.key] = clean.rows;
    }
    next.lists = { ...next.lists, [list.locale]: bucket };
  }
  if (JSON.stringify(next).length > MAX_TOTAL_CHARS) {
    return fail("VALIDATION_ERROR", "Site içeriği çok büyüdü; kullanılmayan liste öğelerini kaldırıp tekrar kaydedin.");
  }

  const now = new Date().toISOString();
  const value = next as unknown as JsonValue;
  await upsertSettingOverride({ scopeType: "platform", scopeId: "*", key: SITE_PAGE_KEY, value, updatedAt: now, updatedBy: ctx.userId });
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action: "site.page.update",
    entityType: "SitePage",
    entityId: SITE_PAGE_KEY,
    before: before as never,
    after: next as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, SITE_PAGE_KEY, value, { reason: "Ana sayfa yapısı güncellendi" });
  return ok({ settings: next });
}
