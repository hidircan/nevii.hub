import { z } from "zod";
import { fail, ok } from "../services/result";
import type { ServiceContext } from "../services/context";
import { PLATFORM_TENANT_ID } from "../auth/config";
import { requireHyperAdmin } from "./access";
import { PLATFORM_SCOPE_ID, recordPublishedVersion } from "./policy-version-log";
import { appendPlatformAudit, listSettingOverrides, upsertSettingOverride } from "./store";
import { getSiteContent } from "../site-locales";
import type { SiteContent, SiteLocale } from "../site-locales";

export const SITE_CONTENT_KEY = "site.content";

/**
 * Anasayfa metin düzenlemeleri — kod içeriğin ÜSTÜNDE ince override katmanı.
 * - Kapsam: tekil metin alanları (başlık/açıklama/düğme). Liste içerikleri
 *   (menü öğeleri, özellik grupları, SSS maddeleri, adımlar) kodda kalır.
 * - Boş bırakılan alan kod varsayılanına düşer ("varsayılana dön").
 * - Yer tutuculu metinler ({equiv}, {pct}, {n}) korunmak zorundadır.
 */
export type ContentField = {
  path: string;
  section: string;
  label: string;
  multiline?: boolean;
  placeholders?: string[];
};

const F = (section: string, path: string, label: string, extra?: Partial<ContentField>): ContentField => ({ section, path, label, ...extra });

export const EDITABLE_CONTENT_FIELDS: ContentField[] = [
  F("Sayfa bilgisi", "meta.title", "Sayfa başlığı"),
  F("Sayfa bilgisi", "meta.description", "Sayfa açıklaması", { multiline: true }),
  F("Genel", "skip", "“İçeriğe atla” bağlantısı"),
  F("Üst menü", "header.login", "Giriş düğmesi"),
  F("Üst menü", "header.languageLabel", "Dil seçimi etiketi"),
  F("Üst menü", "header.demo", "Demo düğmesi"),
  F("Karşılama", "hero.headline", "Ana başlık", { multiline: true }),
  F("Karşılama", "hero.subline", "Alt açıklama", { multiline: true }),
  F("Karşılama", "hero.login", "Giriş düğmesi"),
  F("Karşılama", "hero.trial", "Deneme düğmesi"),
  F("Karşılama", "hero.tour", "Tanıtım düğmesi"),
  F("Hakkında", "about.title", "Başlık"),
  F("Hakkında", "about.description", "Açıklama", { multiline: true }),
  F("Özellikler", "features.title", "Başlık"),
  F("Özellikler", "features.description", "Açıklama", { multiline: true }),
  F("Platform", "platform.title", "Başlık"),
  F("Platform", "platform.description", "Açıklama", { multiline: true }),
  F("Referanslar", "references.title", "Başlık"),
  F("Referanslar", "references.empty", "Boş durum metni", { multiline: true }),
  F("Referanslar", "references.story", "Hikâye metni", { multiline: true }),
  F("Fiyatlandırma", "pricing.title", "Başlık"),
  F("Fiyatlandırma", "pricing.description", "Açıklama", { multiline: true }),
  F("Fiyatlandırma", "pricingPlaceholder.title", "Yer tutucu başlık"),
  F("Fiyatlandırma", "pricingPlaceholder.description", "Yer tutucu açıklama", { multiline: true }),
  F("Fiyatlandırma", "pricingPlaceholder.cta", "Yer tutucu düğmesi"),
  F("Fiyat araçları", "pricingChrome.periodLabel", "Dönem etiketi"),
  F("Fiyat araçları", "pricingChrome.monthly", "Aylık"),
  F("Fiyat araçları", "pricingChrome.yearly", "Yıllık"),
  F("Fiyat araçları", "pricingChrome.perMonth", "“/ay” eki"),
  F("Fiyat araçları", "pricingChrome.perYear", "“/yıl” eki"),
  F("Fiyat araçları", "pricingChrome.yearlyNote", "Yıllık not", { placeholders: ["{equiv}"] }),
  F("Fiyat araçları", "pricingChrome.savings", "Tasarruf notu", { placeholders: ["{pct}"] }),
  F("Fiyat araçları", "pricingChrome.sandboxZero", "Deneme fiyat notu"),
  F("Fiyat araçları", "pricingChrome.customQuote", "Özel teklif etiketi"),
  F("Fiyat araçları", "pricingChrome.notApproved", "Onaysız fiyat notu"),
  F("Fiyat araçları", "pricingChrome.unlimited", "“Sınırsız” etiketi"),
  F("Fiyat araçları", "pricingChrome.students", "“Öğrenci” etiketi"),
  F("Fiyat araçları", "pricingChrome.users", "“Kullanıcı” etiketi"),
  F("Fiyat araçları", "pricingChrome.branches", "“Şube” etiketi"),
  F("Fiyat araçları", "pricingChrome.moreModules", "“Diğer modüller” notu", { placeholders: ["{n}"] }),
  F("Fiyat araçları", "pricingChrome.buy", "Satın al düğmesi"),
  F("Fiyat araçları", "pricingChrome.quote", "Teklif düğmesi"),
  F("Fiyat araçları", "pricingChrome.demoNote", "Demo notu"),
  F("Fiyat araçları", "pricingChrome.trialTeaser", "Deneme tanıtımı"),
  F("Fiyat araçları", "pricingChrome.trialCta", "Deneme düğmesi"),
  F("Satın alma", "purchase.title", "Başlık"),
  F("Satın alma", "purchase.description", "Açıklama", { multiline: true }),
  F("Satın alma", "purchase.cta", "Bağlantı metni"),
  F("Mobil uygulama", "mobileApp.title", "Başlık"),
  F("Mobil uygulama", "mobileApp.description", "Açıklama", { multiline: true }),
  F("Mobil uygulama", "mobileApp.appStore", "App Store düğmesi"),
  F("Mobil uygulama", "mobileApp.play", "Google Play düğmesi"),
  F("Mobil uygulama", "mobileApp.soon", "“Yakında” metni", { multiline: true }),
  F("Mobil uygulama", "mobileApp.openInApp", "“Uygulamada aç” düğmesi"),
  F("Mobil uygulama", "mobileApp.dismiss", "Kapat düğmesi"),
  F("Tanıtım", "media.title", "Başlık"),
  F("Tanıtım", "media.description", "Açıklama", { multiline: true }),
  F("SSS", "faq.title", "Başlık"),
  F("SSS", "faq.description", "Açıklama", { multiline: true }),
  F("İletişim", "contact.title", "Başlık"),
  F("İletişim", "contact.description", "Açıklama", { multiline: true }),
  F("İletişim", "contact.phone", "Telefon etiketi"),
  F("İletişim", "contact.email", "E-posta etiketi"),
  F("İletişim", "contact.address", "Adres etiketi"),
  F("İletişim", "contact.pending", "“Yakında” metni"),
  F("İletişim", "contact.demoTitle", "Demo başlığı"),
  F("İletişim", "contact.demoCta", "Demo e-posta düğmesi"),
  F("İletişim", "contact.follow", "“Takip edin” metni"),
  F("İletişim", "contact.soon", "“Çok yakında” metni"),
  F("İletişim", "contact.mapTitle", "Harita başlığı"),
  F("Altbilgi", "footer.rights", "Hak notu"),
];

const PATHS = new Set(EDITABLE_CONTENT_FIELDS.map((f) => f.path));

function getPath(c: SiteContent, path: string): unknown {
  const [a, b] = path.split(".");
  const root = (c as unknown as Record<string, unknown>)[a!];
  if (b === undefined) return root;
  return (root as Record<string, unknown> | null)?.[b];
}

function setPath(c: SiteContent, path: string, value: string): boolean {
  const [a, b] = path.split(".");
  const root = (c as unknown as Record<string, unknown>)[a!];
  if (b === undefined || typeof root !== "object" || root === null) return false;
  if (typeof (root as Record<string, unknown>)[b] !== "string") return false;
  (root as Record<string, unknown>)[b] = value;
  return true;
}

export type ContentOverrides = Partial<Record<SiteLocale, Record<string, string>>>;

export async function getSiteContentOverrides(): Promise<ContentOverrides> {
  const row = (await listSettingOverrides({ tenantId: PLATFORM_TENANT_ID })).find(
    (o) => o.scopeType === "platform" && o.scopeId === "*" && o.key === SITE_CONTENT_KEY
  );
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const out: ContentOverrides = {};
  for (const locale of ["tr", "en", "de", "fr", "es"] as const) {
    const bucket = v[locale];
    if (typeof bucket !== "object" || bucket === null) continue;
    const clean: Record<string, string> = {};
    for (const [path, text] of Object.entries(bucket as Record<string, unknown>)) {
      if (PATHS.has(path) && typeof text === "string" && text.trim() && text.length <= 2000) clean[path] = text;
    }
    if (Object.keys(clean).length > 0) out[locale] = clean;
  }
  return out;
}

/** Etkin site içeriği: kod varsayılanı + kayıtlı düzenlemeler. */
export async function resolveSiteContent(locale: SiteLocale): Promise<SiteContent> {
  const base = structuredClone(getSiteContent(locale));
  const overrides = await getSiteContentOverrides();
  const bucket = overrides[locale] ?? {};
  for (const [path, text] of Object.entries(bucket)) setPath(base, path, text);
  return base;
}

export async function getSiteContentMeta(ctx: ServiceContext) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  return ok({ overrides: await getSiteContentOverrides(), fields: EDITABLE_CONTENT_FIELDS });
}

const inputSchema = z.object({
  locale: z.enum(["tr", "en", "de", "fr", "es"]),
  values: z.record(z.string(), z.string().max(2000).nullable()),
});

export async function setSiteContentOverrides(ctx: ServiceContext, input: unknown) {
  const gate = requireHyperAdmin(ctx);
  if (!gate.ok) return gate;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Geçersiz site metni yükü.");
  const { locale, values } = parsed.data;
  const before = await getSiteContentOverrides();
  const code = getSiteContent(locale);
  const next: Record<string, string> = { ...(before[locale] ?? {}) };
  for (const [path, text] of Object.entries(values)) {
    if (!PATHS.has(path)) return fail("VALIDATION_ERROR", `Düzenlenemez alan: ${path}.`);
    if (text === null || text.trim() === "") {
      delete next[path];
      continue;
    }
    const field = EDITABLE_CONTENT_FIELDS.find((f) => f.path === path)!;
    for (const ph of field.placeholders ?? []) {
      if (!text.includes(ph)) return fail("VALIDATION_ERROR", `“${field.label}” içinde ${ph} yer tutucusu korunmalı.`);
    }
    const current = getPath(code, path);
    if (typeof current !== "string") return fail("VALIDATION_ERROR", `Düzenlenemez alan: ${path}.`);
    next[path] = text;
  }
  const merged: ContentOverrides = { ...before, [locale]: next };
  if (Object.keys(next).length === 0) delete merged[locale];
  const now = new Date().toISOString();
  await upsertSettingOverride({
    scopeType: "platform",
    scopeId: "*",
    key: SITE_CONTENT_KEY,
    value: { ...merged, updatedAt: now, updatedBy: ctx.userId },
    updatedAt: now,
    updatedBy: ctx.userId,
  });
  await appendPlatformAudit({
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    actorTenantId: ctx.tenantId,
    targetTenantId: null,
    action: "site.content.update",
    entityType: "SiteContent",
    entityId: SITE_CONTENT_KEY,
    before: (before[locale] ?? {}) as never,
    after: next as never,
    requestId: ctx.requestId || "n/a",
    outcome: "success",
  });
  await recordPublishedVersion(ctx, PLATFORM_SCOPE_ID, SITE_CONTENT_KEY, merged, { reason: `Site metinleri güncellendi (${locale})` });
  return ok({ overrides: merged });
}
