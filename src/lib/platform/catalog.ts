import { z } from "zod";
import type { JsonValue, SettingCategory, SettingDefinition, SettingValueType } from "./types";
import { DELETABLE_RETENTION_CATEGORIES, FEATURE_FLAGS, INSTITUTION_TYPES, LIMIT_KINDS, MANAGER_PRESETS } from "./types";
import { FONT_VALUES, THEME_PROFILE_VALUES } from "../theme";
import {
  APPEARANCE_MODES,
  DEFAULT_INVITE_TEMPLATE,
  contractPolicySchema,
  financePolicySchema,
  messageTemplateSchema,
  quietHoursSchema,
  studentFormConfigSchema,
  termPolicySchema,
} from "./policies";

function s(
  key: string,
  category: SettingCategory,
  type: SettingValueType,
  defaultValue: JsonValue,
  description: string,
  extra?: Partial<SettingDefinition>
): SettingDefinition {
  return {
    key,
    category,
    type,
    defaultValue,
    description,
    critical: false,
    version: 1,
    ...extra,
  };
}

export const SETTING_CATALOG: SettingDefinition[] = [
  s("institution.name", "branding", "string", "", "Kurumun görünen adı"),
  s("institution.logoUrl", "branding", "string", "", "Kurum logosu URL'si"),
  s("institution.theme", "branding", "enum", "default", "Kurum tema profili", {
    enumValues: ["default", "light", "dark", "obsidian"],
  }),
  s("institution.colorPrimary", "branding", "color", "#6d28d9", "Birincil marka rengi"),
  s("institution.colorAccent", "branding", "color", "#0ea5e9", "Vurgu rengi"),

  s("locale.language", "locale", "enum", "tr", "Arayüz dili", {
    enumValues: ["tr", "en"],
  }),
  s("locale.timezone", "locale", "string", "Europe/Istanbul", "Saat dilimi (IANA)"),
  s("locale.currency", "locale", "enum", "TRY", "Para birimi", {
    enumValues: ["TRY", "USD", "EUR"],
  }),

  s("contact.email", "contact", "string", "", "Kurum e-posta adresi"),
  s("contact.phone", "contact", "string", "", "Kurum telefonu"),
  s("contact.website", "contact", "string", "", "Kurum web sitesi"),
  s("contact.address", "contact", "string", "", "Kurumsal adres"),
  s("contact.city", "contact", "string", "", "Şehir"),

  s("lessons.defaultDurationMinutes", "lessons", "number", 40, "Varsayılan ders süresi (dakika)", {
    min: 15,
    max: 180,
  }),
  s("makeup.windowDays", "makeup", "number", 14, "Telafi hakkı kullanım penceresi (gün)", {
    min: 0,
    max: 90,
    critical: true,
  }),
  s("makeup.monthlyAllowance", "makeup", "number", 2, "Öğrenci başına aylık telafi hakkı", {
    min: 0,
    max: 20,
    critical: true,
  }),
  s("makeup.cancelPolicy", "makeup", "enum", "credit_on_school_cancel", "İptal / telafi kuralı", {
    enumValues: ["credit_on_school_cancel", "credit_on_student_absent", "no_credit"],
    critical: true,
  }),
  s("lessons.closedDays", "lessons", "string_list", [], "Haftalık kapalı günler (0=Pazar … 6=Cumartesi)"),

  s("attendance.requireStudent", "attendance", "boolean", true, "Öğrenci yoklaması zorunlu"),

  s("homework.enabledDefaults", "homework", "boolean", true, "Ödev verebilme varsayılanı"),
  s("homework.defaultDueDays", "homework", "number", 7, "Varsayılan teslim süresi (gün)", {
    min: 1,
    max: 60,
  }),
  s("homework.requireSubmission", "homework", "boolean", false, "Teslim zorunlu"),

  s("performance.teacherV2", "performance", "boolean", false, "Öğretmen performans v2", {
    critical: true,
  }),
  s("feedback.teacherEnabled", "feedback", "boolean", true, "Öğretmen değerlendirmesi"),
  s("feedback.studentEnabled", "feedback", "boolean", true, "Öğrenci değerlendirmesi"),

  s("curriculum.enabledDefaults", "curriculum", "boolean", true, "Müfredat varsayılanı"),
  s("curriculum.requireTopicProgress", "curriculum", "boolean", false, "Konu ilerlemesi zorunlu"),

  s("payments.dueDayStart", "payments", "number", 1, "Ödeme günü aralığı başlangıcı", {
    min: 1,
    max: 31,
    critical: true,
  }),
  s("payments.dueDayEnd", "payments", "number", 10, "Ödeme günü aralığı bitişi", {
    min: 1,
    max: 31,
    critical: true,
  }),
  s("collections.frequencyLimitDays", "collections", "number", 3, "Tahsilat mesaj sıklık limiti (gün)", {
    min: 1,
    max: 30,
    critical: true,
  }),
  s("collections.autoSendEnabled", "collections", "boolean", false, "Tahsilat otomatik gönderim", {
    critical: true,
  }),
  s("collections.payoutRounding", "collections", "enum", "exact_minutes", "Hakediş yuvarlama", {
    enumValues: ["exact_minutes", "round_30", "fixed_package"],
  }),

  s("portals.parentEnabled", "portals", "boolean", true, "Veli portalı erişimi", { critical: true }),
  s("portals.studentEnabled", "portals", "boolean", true, "Öğrenci portalı erişimi", { critical: true }),
  s("mobile.appEnabled", "mobile", "boolean", false, "Mobil portal genel açık/kapalı", { critical: true, platformOnly: true }),
  s("mobile.iosEnabled", "mobile", "boolean", true, "iOS uygulaması açık", { critical: true, platformOnly: true }),
  s("mobile.androidEnabled", "mobile", "boolean", true, "Android uygulaması açık", { critical: true, platformOnly: true }),
  s("mobile.studentPortalEnabled", "mobile", "boolean", true, "Öğrenci/veli mobil portalı", { critical: true, platformOnly: true }),
  s("mobile.teacherPortalEnabled", "mobile", "boolean", true, "Öğretmen mobil portalı", { critical: true, platformOnly: true }),
  s("mobile.adminPortalEnabled", "mobile", "boolean", false, "Yönetici mobil portalı", { critical: true, platformOnly: true }),
  s("mobile.maintenanceMessage", "mobile", "string", "", "Bakım modu mesajı (doluysa uygulama bakım ekranı gösterir)", { platformOnly: true }),
  s("mobile.minVersion", "mobile", "json", { ios: "1.0.0", android: "1.0.0" }, "Minimum uygulama sürümü (semver)", {
    platformOnly: true,
    critical: true,
  }),
  s("mobile.pushPolicy", "mobile", "enum", "disabled", "Push bildirim politikası (sağlayıcı bağlı değilse gönderim yapılmaz)", {
    enumValues: ["disabled", "allowed"],
    platformOnly: true,
  }),

  s("ai.assistantEnabled", "ai", "boolean", true, "AI asistan", { critical: true }),
  s("ai.monthlyTokenQuota", "ai", "number", 200000, "Aylık AI kota (token tahmini)", {
    min: 0,
    max: 10_000_000,
  }),
  s("ai.dailyRequestQuota", "ai", "number", 200, "Günlük AI istek kotası", {
    min: 0,
    max: 10_000,
  }),

  s("notifications.inAppEnabled", "notifications", "boolean", true, "Uygulama içi bildirimler", {
    userPreference: true,
  }),
  s("notifications.studentContractExpiryDays", "notifications", "number", 15, "Öğrenci sözleşmesi bitiş uyarısı (bitişten kaç gün önce)", {
    min: 1,
    max: 90,
  }),
  s("messaging.announcementsEnabled", "messaging", "boolean", true, "Duyuru modülü"),
  s("messaging.smsEnabled", "messaging", "boolean", false, "SMS modülü", { critical: true }),
  s("messaging.whatsappEnabled", "messaging", "boolean", false, "WhatsApp modülü", { critical: true }),
  s("messaging.emailEnabled", "messaging", "boolean", false, "E-posta modülü", { critical: true }),

  // ── NeviiOS Control Center ──
  s("institution.type", "branding", "enum", "music", "Kurum türü (dikey çözüm paketi)", {
    enumValues: [...INSTITUTION_TYPES],
    platformOnly: true,
  }),
  s("institution.loginMessage", "branding", "string", "", "Giriş ekranı / portal karşılama metni"),
  s("institution.supportContact", "contact", "string", "", "Kurum destek iletişim bilgisi"),

  s("appearance.mode", "appearance", "enum", "light_and_dark", "Görünüm modu politikası", {
    enumValues: [...APPEARANCE_MODES],
    platformOnly: true,
  }),
  s("appearance.fixedTheme", "appearance", "enum", "none", "Sabit kurum teması (none = kullanıcı seçer)", {
    enumValues: ["none", ...THEME_PROFILE_VALUES],
    platformOnly: true,
  }),
  s("appearance.fontPolicy", "appearance", "enum", "user_choice", "Yazı tipi politikası", {
    enumValues: ["user_choice", ...FONT_VALUES],
    platformOnly: true,
  }),
  s("locale.availableLanguages", "locale", "string_list", ["tr"], "Kullanılabilir arayüz dilleri (geleceğe hazır)", {
    enumValues: ["tr", "en"],
    platformOnly: true,
  }),

  s("subscription.addons", "subscription", "string_list", [], "Ek modüller (paket dışı ticari hak)", {
    enumValues: [...FEATURE_FLAGS],
    platformOnly: true,
    critical: true,
  }),
  s("subscription.entitlementOverrides", "subscription", "json", {}, "Kuruma özel entitlement override (true=ver, false=geri al)", {
    platformOnly: true,
    critical: true,
  }),
  s("subscription.limitOverrides", "subscription", "json", {}, "Kuruma özel limit override — {\"students\": {\"value\": 150, \"reason\": \"…\", \"expiresAt\": \"2026-12-31T00:00:00Z\"}} (value null = sınırsız)", {
    platformOnly: true,
    critical: true,
  }),

  s("subscription.snapshot", "subscription", "json", null, "Aktif abonelik snapshot'ı (paket/limit/modül/fiyat kopyası — katalog değişikliği mevcut aboneliği etkilemez)", {
    platformOnly: true,
    critical: true,
  }),

  // ── SaaS abonelik enforcement (V1) ──
  s("billing.enforcement", "subscription", "boolean", false, "SaaS abonelik enforcement (kapalı = legacy/managed kapsam, erişim kısıtlanmaz; açık = ödeme yoksa işlevsel erişim kısıtlanır)", {
    platformOnly: true,
    critical: true,
  }),
  s("billing.graceDays", "subscription", "number", 0, "Ödenmiş süre sonrası ek tolerans (gün); varsayılan 0, NeviiOS'tan ayarlanır", {
    min: 0,
    max: 30,
    platformOnly: true,
  }),
  s("billing.trialPlanKey", "subscription", "string", "core", "Deneme paketi (NeviiOS'tan yapılandırılır)", {
    platformOnly: true,
  }),
  s("billing.exception", "subscription", "json", null, "HYPER_ADMIN manuel süre/istisna — {until, reason, by}; ödenmiş kaydı taklit etmez", {
    platformOnly: true,
    critical: true,
  }),
  s("forms.studentRegistration", "forms", "json", { fields: [] }, "Yeni Öğrenci Kaydı alan konfigürasyonu", {
    critical: true,
  }),

  s("policy.terms", "policy", "json", { terms: [] }, "Dönem tanımları", { critical: true }),
  s(
    "policy.finance",
    "policy",
    "json",
    {
      billingModel: "monthly",
      firstChargeRule: "on_enrollment",
      depositAmount: 0,
      lateFeePercent: 0,
      refundPolicy: "prorated",
      cancelNoticeDays: 30,
    },
    "Tahsilat / ücret politikası (yeni kayıtlar için; eski kayıtlar snapshot ile korunur)",
    { critical: true }
  ),
  s(
    "policy.contract",
    "policy",
    "json",
    { numberingPrefix: "SOZ", requiresApproval: true, extraClauses: [] },
    "Sözleşme politikası",
    { critical: true }
  ),

  s("communication.inviteTemplate", "communication", "json", DEFAULT_INVITE_TEMPLATE, "Davet e-postası şablonu"),
  s("communication.quietHours", "communication", "json", { start: "21:00", end: "09:00" }, "Sessiz saatler"),
  s("communication.channels", "communication", "string_list", ["in_app", "email"], "Açık bildirim kanalları", {
    enumValues: ["in_app", "email", "sms", "whatsapp"],
  }),

  s("auth.loginMethods", "auth", "string_list", ["email_password"], "Giriş yöntemleri", {
    enumValues: ["email_password", "phone_otp"],
    platformOnly: true,
  }),
  s("auth.inviteTtlDays", "auth", "number", 7, "Davet bağlantısı geçerlilik süresi (gün)", {
    min: 1,
    max: 30,
    platformOnly: true,
  }),
  s("auth.passwordMinLength", "auth", "number", 8, "Minimum parola uzunluğu", {
    min: 8,
    max: 64,
    platformOnly: true,
    critical: true,
  }),

  s(
    "access.managerPreset",
    "access",
    "enum",
    "branch_scoped",
    "Yönetici izin preset'i — unified: Şube Müdürü = Kurum Yöneticisi (kurum geneli); branch_scoped: yalnız atanmış şube",
    { enumValues: [...MANAGER_PRESETS], platformOnly: true, critical: true }
  ),
  s(
    "access.teacherEarningsAccess",
    "access",
    "enum",
    "school_admin",
    "Öğretmen Hakedişleri erişimi — owner_only: yalnız kurum sahibi; school_admin: + Kurum Yöneticisi; school_admin_and_branch_manager: + Şube Müdürü (yalnız unified preset). Genel finans/personel yetkisi DEĞİLDİR.",
    { enumValues: ["owner_only", "school_admin", "school_admin_and_branch_manager"], platformOnly: true, critical: true }
  ),
  s("retention.days", "operations", "json", {}, "Log saklama süreleri (gün) — kritik audit kategorileri ayarlanamaz, asla silinmez", {
    platformOnly: true,
    critical: true,
  }),
];

const limitOverrideEntry = z.object({
  value: z.number().int().min(0).max(1_000_000).nullable(),
  reason: z.string().trim().min(10, "Limit override gerekçesi en az 10 karakter olmalı").max(300),
  expiresAt: z.iso.datetime({ message: "Bitiş tarihi ISO formatında olmalı" }),
});

const minor = z.number().int().min(0).max(1_000_000_000);
const limitValue = z.number().int().min(0).max(1_000_000).nullable();
export const subscriptionSnapshotSchema = z.object({
  planKey: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  planLabel: z.string().min(1).max(80),
  catalogVersion: z.number().int().min(0).nullable(),
  limits: z.object({ students: limitValue, users: limitValue, branches: limitValue }),
  includedModules: z.array(z.enum(FEATURE_FLAGS)),
  pricing: z.object({
    currency: z.literal("TRY"),
    mode: z.enum(["list", "custom_quote"]),
    basePriceMonthlyMinor: minor,
    basePriceYearlyMinor: minor,
    modulePricesMonthlyMinor: z.partialRecord(z.enum(FEATURE_FLAGS), minor),
    modulePricesYearlyMinor: z.partialRecord(z.enum(FEATURE_FLAGS), minor),
    published: z.boolean(),
  }),
  subscribedAt: z.iso.datetime(),
  subscribedBy: z.string().min(1),
});

/** json tipli ayarların tam şeması — sunucu yazımında zorunlu doğrulama. */
const JSON_SETTING_SCHEMAS: Record<string, z.ZodType<unknown>> = {
  "subscription.entitlementOverrides": z.partialRecord(z.enum(FEATURE_FLAGS), z.boolean()),
  "subscription.limitOverrides": z.partialRecord(z.enum(LIMIT_KINDS), limitOverrideEntry),
  "forms.studentRegistration": studentFormConfigSchema,
  "policy.terms": termPolicySchema,
  "policy.finance": financePolicySchema,
  "policy.contract": contractPolicySchema,
  "communication.inviteTemplate": messageTemplateSchema,
  "communication.quietHours": quietHoursSchema,
  "subscription.snapshot": subscriptionSnapshotSchema,
  "billing.exception": z
    .object({
      until: z.iso.datetime({ message: "İstisna bitiş zamanı ISO formatında olmalı" }),
      reason: z.string().trim().min(10, "İstisna gerekçesi en az 10 karakter olmalı").max(300),
      by: z.string().min(1),
    })
    .nullable(),
  "retention.days": z.partialRecord(z.enum(DELETABLE_RETENTION_CATEGORIES), z.number().int().min(7).max(3650)),
  "mobile.minVersion": z.object({
    ios: z.string().regex(/^\d+\.\d+\.\d+$/, "Sürüm x.y.z olmalı"),
    android: z.string().regex(/^\d+\.\d+\.\d+$/, "Sürüm x.y.z olmalı"),
  }),
};

export const SETTING_BY_KEY = new Map(SETTING_CATALOG.map((d) => [d.key, d]));

/**
 * Control Center (2026-09-28) — anahtar-bazlı ek doğrulama: şema tipi
 * `string` olan anahtarlar her şeyi kabul eder; kullanıcıdan gelen
 * metin/görsel için burada daraltılır. Başarısızlık Türkçe mesajla döner
 * (parseSettingValue üzerinden tüm yazım yollarına uygulanır).
 */
const MAX_LOGO_URL_LENGTH = 500;
const MAX_LOGIN_MESSAGE_LENGTH = 500;

function validateBrandKey(key: string, value: JsonValue): string | null {
  if (key === "institution.logoUrl") {
    if (typeof value !== "string") return "Logo adresi metin olmalı.";
    const trimmed = value.trim();
    if (trimmed.length === 0) return null; // boş = logo yok
    if (trimmed.length > MAX_LOGO_URL_LENGTH) return `Logo adresi en fazla ${MAX_LOGO_URL_LENGTH} karakter olabilir.`;
    if (/^data:/i.test(trimmed)) return "Logo adresi olarak data-URI kullanılamaz; https veya site-içi yol girin.";
    if (/^javascript:/i.test(trimmed) || /[<>"']/.test(trimmed)) return "Logo adresi geçersiz karakter içeriyor.";
    if (/^https?:\/\//i.test(trimmed)) return null;
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return null;
    return "Logo adresi https ile başlamalı veya / ile başlayan site-içi yol olmalı.";
  }
  if (key === "institution.loginMessage") {
    if (typeof value !== "string") return "Karşılama metni metin olmalı.";
    if (value.length > MAX_LOGIN_MESSAGE_LENGTH) return `Karşılama metni en fazla ${MAX_LOGIN_MESSAGE_LENGTH} karakter olabilir.`;
    if (/<[a-z][\s\S]*>/i.test(value)) return "Karşılama metni HTML içeremez; düz metin girin.";
    return null;
  }
  if (key === "institution.name") {
    if (typeof value !== "string") return "Kurum adı metin olmalı.";
    if (value.length > 120) return "Kurum adı en fazla 120 karakter olabilir.";
    if (/<[a-z][\s\S]*>/i.test(value)) return "Kurum adı HTML içeremez.";
    return null;
  }
  return null;
}

export const SETTING_CATEGORY_LABELS: Record<SettingCategory, string> = {
  branding: "Marka ve görünüm",
  locale: "Dil, saat ve para birimi",
  contact: "İletişim ve kurumsal bilgiler",
  lessons: "Dersler ve kapalı günler",
  makeup: "İptal ve telafi",
  attendance: "Yoklama",
  homework: "Ödev",
  performance: "Öğretmen performansı",
  feedback: "Değerlendirme",
  curriculum: "Müfredat",
  payments: "Ödemeler",
  collections: "Tahsilat ve hakediş",
  portals: "Portal erişimi",
  mobile: "Mobil platform policy",
  ai: "AI asistan ve kota",
  notifications: "Bildirim tercihleri",
  messaging: "Duyuru, SMS, WhatsApp, e-posta",
  appearance: "Görünüm politikası",
  subscription: "Paket, eklenti ve limitler",
  forms: "Form konfigürasyonu",
  policy: "Dönem, finans ve sözleşme",
  communication: "İletişim ve şablonlar",
  auth: "Giriş ve davet politikası",
  access: "Rol ve izin preset'leri",
  operations: "Operasyon ve log saklama",
};

export const SOURCE_SCOPE_LABELS = {
  platform: "Platform varsayılanı",
  plan: "Paket varsayılanı",
  tenant: "Kurum ayarı",
  branch: "Şube override",
  user: "Kullanıcı tercihi",
} as const;

function colorSchema() {
  return z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "Geçerli bir renk kodu girin (#RRGGBB)");
}

export function validationSchemaFor(def: SettingDefinition): z.ZodType<JsonValue> {
  switch (def.type) {
    case "string":
      return z.string();
    case "number": {
      let n = z.number();
      if (def.min !== undefined) n = n.min(def.min);
      if (def.max !== undefined) n = n.max(def.max);
      return n;
    }
    case "boolean":
      return z.boolean();
    case "string_list":
      return def.enumValues && def.enumValues.length > 0
        ? z.array(z.enum(def.enumValues as [string, ...string[]]))
        : z.array(z.string());
    case "enum":
      return z.enum(def.enumValues && def.enumValues.length > 0 ? (def.enumValues as [string, ...string[]]) : ["default"]);
    case "color":
      return colorSchema();
    case "json": {
      // Şeması tanımsız json ayarı fail-closed reddedilir.
      const schema = JSON_SETTING_SCHEMAS[def.key];
      return (schema ?? z.never()) as z.ZodType<JsonValue>;
    }
    default:
      return z.unknown() as z.ZodType<JsonValue>;
  }
}

export function parseSettingValue(
  def: SettingDefinition,
  value: unknown
): { ok: true; value: JsonValue } | { ok: false; message: string } {
  const parsed = validationSchemaFor(def).safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? `Geçersiz değer: ${def.key}`,
    };
  }
  const brandError = validateBrandKey(def.key, parsed.data as JsonValue);
  if (brandError) return { ok: false, message: brandError };
  return { ok: true, value: parsed.data as JsonValue };
}
