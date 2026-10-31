import type { FeatureFlagKey } from "./types";

/**
 * NeviiOS rol / permission matrix — TEK resolver.
 *
 * Erişim = entitlement AND feature flag AND permission AND tenant/şube kapsamı.
 * Bu modül "permission" ve "kapsam seviyesi" katmanıdır; entitlement/flag
 * `resolveAllFeatures`, somut şube kapsamı `resolveBranchScope` ile birleşir
 * (bkz. `canAccessScreen`, branch-scope.ts `assertBranchOperation`).
 *
 * Menü görünürlüğü (NeviiOS platform menüsü, /sube) ve sunucu kontrolü
 * (NeviiOS API'leri, BRANCH_MANAGER tool kapıları) aynı `hasGrant`'i kullanır.
 * Legacy panel araçları hâlâ `requireRole` + `rbac.ts` ile korunur.
 */

export const PERM_RESOURCES = {
  students: "Öğrenciler",
  parents: "Veliler",
  teachers: "Öğretmenler",
  staff: "Personel",
  branches: "Şubeler",
  schedule: "Ders programı",
  attendance: "Yoklama",
  makeup: "Telafi",
  announcements: "Duyurular",
  contracts: "Sözleşmeler",
  collections: "Tahsilat",
  finance_summary: "Finans özeti",
  reports: "Raporlar",
  export: "Export",
  invitations: "Davetler",
  users: "Kullanıcılar",
  roles: "Roller",
  institution_settings: "Kurum ayarları",
  appearance: "Appearance",
  integrations: "Entegrasyonlar",
  packages: "Paketler",
  saas_billing: "SaaS abonelik tahsilatı",
  entitlements: "Entitlement",
  feature_flags: "Feature flag",
  audit: "Audit",
  support_access: "Support access",
  platform_branding: "Platform marka ayarları",
  mobile_policy: "Mobil platform policy",
} as const;
export type PermResource = keyof typeof PERM_RESOURCES;
export const PERM_RESOURCE_KEYS = Object.keys(PERM_RESOURCES) as PermResource[];

export const PERM_ACTIONS = ["read", "create", "update", "delete", "approve", "export", "invite", "manage", "configure"] as const;
export type PermAction = (typeof PERM_ACTIONS)[number];

/** Geniş → dar. Üst kapsamdaki grant alt kapsamı karşılar (tenant ⊇ branch ⊇ assigned ⊇ own). */
export const PERM_SCOPES = ["platform", "tenant", "branch", "assigned", "own"] as const;
export type PermScope = (typeof PERM_SCOPES)[number];

export type Grant = { resource: PermResource; action: PermAction; scope: PermScope };

/** Yalnız platform kapsamında anlamlı kaynaklar — tenant rolleri/özel roller alamaz. */
export const PLATFORM_ONLY_RESOURCES: readonly PermResource[] = [
  "packages",
  "saas_billing",
  "entitlements",
  "feature_flags",
  "support_access",
  "platform_branding",
  "mobile_policy",
];

export const SYSTEM_ROLE_KEYS = [
  "HYPER_ADMIN",
  "SUPER_ADMIN",
  "BRANCH_MANAGER",
  "SCHOOL_ADMIN",
  "STAFF",
  "TEACHER",
  "STUDENT",
  "PARENT",
] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export const SYSTEM_ROLE_META: Record<SystemRoleKey, { label: string; loginRole: string; note: string }> = {
  HYPER_ADMIN: { label: "Platform Sahibi", loginRole: "Platform girişi", note: "NeviiOS sahibi. Normal ekrandan atanamaz; temel izinleri düşürülemez." },
  SUPER_ADMIN: { label: "Kurum Sahibi", loginRole: "Kurum girişi", note: "Yalnız kendi kurumu. Platform izni yok." },
  BRANCH_MANAGER: { label: "Şube Müdürü", loginRole: "Kurum girişi", note: "Yalnız atanmış şubeler; atama yoksa erişim kapalıdır." },
  SCHOOL_ADMIN: { label: "Kurum Yöneticisi (eski)", loginRole: "Kurum girişi", note: "Eski geçiş rolü; kendiliğinden Şube Müdürü olmaz." },
  STAFF: { label: "Personel", loginRole: "—", note: "Henüz giriş için kullanılmıyor; hazır olunca açılır." },
  TEACHER: { label: "Öğretmen", loginRole: "Kurum girişi", note: "Yalnız kendisine atanmış öğrenci ve dersler." },
  STUDENT: { label: "Öğrenci", loginRole: "Öğrenci girişi", note: "Yalnız kendi kaydı." },
  PARENT: { label: "Veli", loginRole: "Veli girişi", note: "Öğrenci girişi üzerinden veli erişimi." },
};

function g(scope: PermScope, spec: Partial<Record<PermResource, PermAction[]>>): Grant[] {
  const out: Grant[] = [];
  for (const [resource, actions] of Object.entries(spec) as [PermResource, PermAction[]][]) {
    for (const action of actions) out.push({ resource, action, scope });
  }
  return out;
}

const ALL: PermAction[] = [...PERM_ACTIONS];
const CRUD: PermAction[] = ["read", "create", "update", "delete"];

export const SYSTEM_ROLE_GRANTS: Record<SystemRoleKey, Grant[]> = {
  HYPER_ADMIN: PERM_RESOURCE_KEYS.flatMap((r) => ALL.map((a) => ({ resource: r, action: a, scope: "platform" as const }))),
  SUPER_ADMIN: g("tenant", {
    students: [...CRUD, "export"],
    parents: [...CRUD],
    teachers: [...CRUD],
    staff: [...CRUD, "manage"],
    branches: [...CRUD],
    schedule: [...CRUD],
    attendance: ["read", "create", "update"],
    makeup: ["read", "create", "update", "approve"],
    announcements: [...CRUD],
    contracts: [...CRUD, "approve"],
    collections: ["read", "create", "update", "approve"],
    finance_summary: ["read", "export"],
    reports: ["read", "export"],
    export: ["export"],
    invitations: ["read", "invite"],
    users: ["read"],
    roles: ["read"],
    institution_settings: ["read", "update", "configure"],
    appearance: ["read"],
    integrations: ["read", "configure"],
    audit: ["read"],
  }),
  /**
   * Owner kararı (2026-09-11): personel (staff) ve kurum geneli finans özeti
   * YOK. Öğrenci, sözleşme, tahsilat, ücret, program, yoklama, telafi var.
   * "unified" preset'li kurumda BRANCH_MANAGER bu seti kullanır.
   */
  SCHOOL_ADMIN: g("tenant", {
    students: [...CRUD, "export"],
    parents: [...CRUD],
    teachers: [...CRUD],
    branches: ["read", "update"],
    schedule: [...CRUD],
    attendance: ["read", "create", "update"],
    makeup: ["read", "create", "update", "approve"],
    announcements: [...CRUD],
    contracts: ["read", "create", "update"],
    collections: ["read", "create", "update"],
    reports: ["read", "export"],
    export: ["export"],
    institution_settings: ["read", "update"],
    appearance: ["read"],
    audit: ["read"],
  }),
  BRANCH_MANAGER: g("branch", {
    students: ["read", "update"],
    schedule: ["read", "create", "update"],
    attendance: ["read", "create", "update"],
    makeup: ["read", "create", "update"],
    teachers: ["read"],
    announcements: ["read", "create", "update"],
  }),
  STAFF: g("branch", { students: ["read"], schedule: ["read"], attendance: ["read"] }),
  TEACHER: g("assigned", {
    students: ["read"],
    schedule: ["read"],
    attendance: ["read", "create", "update"],
    makeup: ["read", "create"],
    announcements: ["read"],
  }),
  STUDENT: g("own", { schedule: ["read"], attendance: ["read"], makeup: ["read", "create"], announcements: ["read"] }),
  PARENT: g("own", { schedule: ["read"], attendance: ["read"], makeup: ["read", "create"], announcements: ["read"], collections: ["read"] }),
};

export function scopeCovers(granted: PermScope, requested: PermScope): boolean {
  return PERM_SCOPES.indexOf(granted) <= PERM_SCOPES.indexOf(requested);
}

export function hasGrant(grants: Grant[], resource: PermResource, action: PermAction, scope: PermScope): boolean {
  return grants.some((x) => x.resource === resource && x.action === action && scopeCovers(x.scope, scope));
}

export function systemGrantsForLoginRole(role: string): Grant[] {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(role) ? SYSTEM_ROLE_GRANTS[role as SystemRoleKey] : [];
}

/**
 * Kurum yönetici preset'ine göre sistem rolünün EFEKTİF grant'leri.
 * "unified": BRANCH_MANAGER = SCHOOL_ADMIN (aynı dizi — eşitlik referans
 * düzeyinde, ayrışma yalnız preset değişimiyle olur).
 */
export function effectiveSystemGrants(role: string, preset: "unified" | "branch_scoped"): Grant[] {
  if (role === "BRANCH_MANAGER" && preset === "unified") return SYSTEM_ROLE_GRANTS.SCHOOL_ADMIN;
  return systemGrantsForLoginRole(role);
}

/** Owner kararı: şimdilik yalnız Kurum Sahibi (SUPER_ADMIN) sistem rolünde; özel role verilemez. */
export const OWNER_ONLY_RESOURCES: readonly PermResource[] = ["staff", "finance_summary"];

/**
 * Özel rol grant doğrulaması: platform kapsamı ve platform-only kaynak yasak.
 * Anahtar sistem rol adlarıyla (büyük/küçük harf fark etmez) çakışamaz.
 */
export function validateCustomRole(input: { key: string; grants: Grant[] }): string | null {
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(input.key)) return "Rol anahtarı küçük harf/rakam/alt çizgi, 3-32 karakter olmalı.";
  if ((SYSTEM_ROLE_KEYS as readonly string[]).includes(input.key.toUpperCase()) || input.key.toUpperCase() === "AI_AGENT") {
    return "Rol anahtarı bir sistem rolüyle çakışıyor.";
  }
  for (const gr of input.grants) {
    if (!(PERM_RESOURCE_KEYS as string[]).includes(gr.resource)) return `Bilinmeyen kaynak: ${gr.resource}`;
    if (!(PERM_ACTIONS as readonly string[]).includes(gr.action)) return `Bilinmeyen aksiyon: ${gr.action}`;
    if (!(PERM_SCOPES as readonly string[]).includes(gr.scope)) return `Bilinmeyen kapsam: ${gr.scope}`;
    if (gr.scope === "platform") return "Kurum rolleri platform kapsamı alamaz.";
    if (PLATFORM_ONLY_RESOURCES.includes(gr.resource)) return `"${PERM_RESOURCES[gr.resource]}" yalnız platform kaynağıdır.`;
    if (OWNER_ONLY_RESOURCES.includes(gr.resource)) return `"${PERM_RESOURCES[gr.resource]}" şimdilik yalnız Kurum Sahibi rolündedir (owner kararı).`;
  }
  return null;
}

// ───────────────────── Ekran / modül registry ─────────────────────

export type ScreenDef = {
  id: string;
  label: string;
  /**
   * platform/sube: menü + sunucu kontrolü bu registry ve `resolveGrants` ile.
   * panel: legacy — sayfa/tool kapısı sistem rolüyle (rbac.ts + requireRole);
   * buradaki grant aynı kararı matris dilinde belgeler (roller ekranı, etki önizlemesi).
   */
  area: "platform" | "sube" | "panel";
  path: string;
  requires: Grant;
  /** Kapalıysa izin olsa bile ekran açılmaz. */
  feature?: FeatureFlagKey;
  /** Menüde gösterilmez (ör. yalnız aksiyonla açılan sayfa). */
  hiddenInNav?: boolean;
  /** Menü grup başlığı (örn. "Satış ve Abonelik"); yoksa grupsuz listelenir. */
  navGroup?: string;
  keywords?: string[];
};

const P = (resource: PermResource, action: PermAction = "read"): Grant => ({ resource, action, scope: "platform" });
const B = (resource: PermResource, action: PermAction = "read"): Grant => ({ resource, action, scope: "branch" });
const K = (resource: PermResource, action: PermAction = "read"): Grant => ({ resource, action, scope: "tenant" });

export const SCREEN_REGISTRY: ScreenDef[] = [
  // ── Genel Bakış (grupsuz, ilk) ──
  { id: "platform.overview", label: "Özet", area: "platform", path: "/platform", requires: P("audit"), keywords: ["dashboard", "özet"] },
  // ── Kurumlar ve Erişim ──
  { id: "platform.tenants", label: "Kurumlar", area: "platform", path: "/platform/kurumlar", requires: P("institution_settings"), navGroup: "Kurumlar ve Erişim", keywords: ["kurum", "tenant", "portföy"] },
  {
    id: "platform.tenants.new",
    label: "Yeni kurum oluştur",
    area: "platform",
    path: "/platform/kurumlar/yeni",
    requires: P("institution_settings", "create"),
    hiddenInNav: true,
    navGroup: "Kurumlar ve Erişim",
    keywords: ["kurum oluştur", "onboarding"],
  },
  { id: "platform.users", label: "Kullanıcılar", area: "platform", path: "/platform/kullanicilar", requires: P("users", "manage"), navGroup: "Kurumlar ve Erişim", keywords: ["kullanıcı", "davet", "pasif"] },
  { id: "platform.roles", label: "Roller ve izinler", area: "platform", path: "/platform/roller", requires: P("roles", "manage"), navGroup: "Kurumlar ve Erişim", keywords: ["rol", "permission", "yetki", "matris"] },
  { id: "platform.settings", label: "Platform varsayılanları", area: "platform", path: "/platform/ayarlar", requires: P("institution_settings", "configure"), navGroup: "Kurumlar ve Erişim", keywords: ["ayar", "varsayılan"] },
  // ── Satış ve Abonelik ──
  { id: "platform.packages", label: "Paketler ve Fiyatlar", area: "platform", path: "/platform/paketler", requires: P("packages", "manage"), navGroup: "Satış ve Abonelik", keywords: ["paket", "fiyat", "addon", "modül"] },
  { id: "platform.packages.new", label: "Yeni paket", area: "platform", path: "/platform/paketler/yeni", requires: P("packages", "manage"), hiddenInNav: true, navGroup: "Satış ve Abonelik", keywords: ["paket oluştur", "paket düzenle"] },
  { id: "platform.billing", label: "Kurum Abonelikleri", area: "platform", path: "/platform/fatura", requires: P("saas_billing", "manage"), navGroup: "Satış ve Abonelik", keywords: ["abonelik", "tahsilat", "fatura", "deneme", "kampanya", "webhook"] },
  { id: "platform.billing.requests", label: "Başvurular ve Teklif Talepleri", area: "platform", path: "/platform/basvurular", requires: P("saas_billing", "manage"), navGroup: "Satış ve Abonelik", keywords: ["başvuru", "deneme başvurusu", "teklif", "davet"] },
  { id: "platform.billing.legaldocs", label: "Hukuki Belgeler", area: "platform", path: "/platform/hukuki-belgeler", requires: P("saas_billing", "manage"), navGroup: "Satış ve Abonelik", keywords: ["sözleşme", "hukuki", "belge", "kvkk", "onay", "taslak"] },
  { id: "platform.billing.campaigns", label: "Kampanyalar", area: "platform", path: "/platform/kampanyalar", requires: P("saas_billing", "manage"), navGroup: "Satış ve Abonelik", keywords: ["kampanya", "indirim", "pilot", "kupon"] },
  { id: "platform.billing.edocs", label: "Faturalar / e-Belgeler", area: "platform", path: "/platform/fatura/e-belgeler", requires: P("saas_billing", "manage"), navGroup: "Satış ve Abonelik", keywords: ["e-fatura", "e-arşiv", "belge", "fatura", "sipariş"] },
  { id: "platform.billing.tax", label: "KDV Oranı", area: "platform", path: "/platform/fatura/kdv-orani", requires: P("saas_billing", "manage"), navGroup: "Satış ve Abonelik", keywords: ["kdv", "vergi", "oran"] },
  // ── Marka ve Site ──
  { id: "platform.branding", label: "Platform markası", area: "platform", path: "/platform/marka", requires: P("platform_branding", "configure"), navGroup: "Marka ve Site", keywords: ["logo", "marka"] },
  { id: "platform.site", label: "Site ayarları", area: "platform", path: "/platform/site-ayarlari", requires: P("platform_branding", "configure"), navGroup: "Marka ve Site", keywords: ["site", "sosyal medya", "anasayfa", "mobil uygulama", "mağaza"] },
  { id: "platform.blog", label: "Blog", area: "platform", path: "/platform/blog", requires: P("platform_branding", "configure"), navGroup: "Marka ve Site", keywords: ["blog", "yazı", "kategori"] },
  // ── Entegrasyonlar (ödeme + diğer, tek girişler) ──
  { id: "platform.billing.providers", label: "Ödeme Sağlayıcıları", area: "platform", path: "/platform/odeme-saglayicilari", requires: P("saas_billing", "manage"), navGroup: "Entegrasyonlar", keywords: ["paytr", "iyzico", "sağlayıcı", "merchant", "callback", "webhook", "kart"] },
  { id: "platform.integrations", label: "Mesajlaşma ve servisler", area: "platform", path: "/platform/entegrasyonlar", requires: P("integrations", "configure"), navGroup: "Entegrasyonlar", keywords: ["sms", "smtp", "e-posta", "whatsapp", "ai"] },
  // ── Güvenlik ve Operasyon ──
  { id: "platform.audit", label: "Denetim", area: "platform", path: "/platform/denetim", requires: P("audit"), navGroup: "Güvenlik ve Operasyon", keywords: ["audit", "log", "denetim"] },
  { id: "platform.health", label: "Sistem sağlığı", area: "platform", path: "/platform/sistem-sagligi", requires: P("audit"), navGroup: "Güvenlik ve Operasyon", keywords: ["sağlık", "health"] },
  { id: "platform.ops.sessions", label: "Canlı operasyon", area: "platform", path: "/platform/operasyon/aktif-oturumlar", requires: P("users", "manage"), navGroup: "Güvenlik ve Operasyon", keywords: ["oturum", "session", "canlı", "aktif"] },
  { id: "platform.ops.retention", label: "Log saklama", area: "platform", path: "/platform/operasyon/log-politikasi", requires: P("audit", "configure"), navGroup: "Güvenlik ve Operasyon", keywords: ["log", "retention", "temizlik"] },
  { id: "platform.release", label: "Release merkezi", area: "platform", path: "/platform/release-merkezi", requires: P("audit"), navGroup: "Güvenlik ve Operasyon", keywords: ["release", "sürüm", "deploy"] },
  { id: "platform.release.versions", label: "Sürümler", area: "platform", path: "/platform/surumler", requires: P("audit"), hiddenInNav: true, navGroup: "Güvenlik ve Operasyon", keywords: ["sürüm", "version", "commit"] },
  { id: "platform.release.deployments", label: "Deploymentlar", area: "platform", path: "/platform/deploymentlar", requires: P("audit"), hiddenInNav: true, navGroup: "Güvenlik ve Operasyon", keywords: ["deployment", "vercel"] },
  { id: "sube.overview", label: "Şube paneli", area: "sube", path: "/sube", requires: B("students"), keywords: ["şube"] },
  { id: "sube.attendance", label: "Yoklama", area: "sube", path: "/sube#yoklama", requires: B("attendance", "update"), keywords: ["yoklama"] },
  { id: "sube.announcements", label: "Duyurular", area: "sube", path: "/sube#duyuru", requires: B("announcements", "create"), feature: "announcements", keywords: ["duyuru"] },
  { id: "panel.students", label: "Öğrenciler", area: "panel", path: "/panel/ogrenciler", requires: K("students") },
  { id: "panel.contracts", label: "Öğrenci paketleri / sözleşme", area: "panel", path: "/panel/paketler", requires: K("contracts") },
  { id: "panel.fees", label: "Öğrenci ücret kuralları", area: "panel", path: "/panel/ucret-kurallari", requires: K("contracts", "update") },
  { id: "panel.payments", label: "Ödemeler / tahsilat", area: "panel", path: "/panel/odemeler", requires: K("collections"), feature: "payments" },
  { id: "panel.schedule", label: "Ders programı", area: "panel", path: "/panel/program", requires: K("schedule") },
  { id: "panel.attendance", label: "Yoklama", area: "panel", path: "/panel/yoklama", requires: K("attendance", "update") },
  { id: "panel.makeup", label: "Telafi merkezi", area: "panel", path: "/panel/telafi", requires: K("makeup", "update") },
  { id: "panel.teachers", label: "Öğretmenler", area: "panel", path: "/panel/ogretmenler", requires: K("teachers") },
  { id: "panel.announcements", label: "Duyurular", area: "panel", path: "/panel/duyurular", requires: K("announcements", "create"), feature: "announcements" },
  { id: "panel.audit", label: "Denetim kaydı", area: "panel", path: "/panel/denetim-kaydi", requires: K("audit") },
  { id: "panel.staff", label: "Personel (özlük, bordro, izin, avans)", area: "panel", path: "/panel/personel", requires: K("staff") },
  { id: "panel.finance_summary", label: "Finans özeti (kurum geneli)", area: "panel", path: "/panel/finans-ozeti", requires: K("finance_summary") },
];

/** Modül (feature flag) → etkilediği izin kaynakları. Erişim = entitlement AND flag AND izin AND kapsam. */
export const FEATURE_RESOURCE_MAP: Partial<Record<FeatureFlagKey, PermResource[]>> = {
  payments: ["collections", "contracts"],
  collections: ["collections"],
  announcements: ["announcements"],
  teacherPayouts: ["teachers"],
  crm: ["students"],
  documents: ["students"],
  parentPortal: ["parents"],
  studentPortal: ["students"],
  mobileApp: ["mobile_policy"],
};

export type ScreenAccessInput = { grants: Grant[]; enabledFeatures?: ReadonlySet<FeatureFlagKey> | null };

export function canAccessScreen(input: ScreenAccessInput, screen: ScreenDef): boolean {
  if (!hasGrant(input.grants, screen.requires.resource, screen.requires.action, screen.requires.scope)) return false;
  if (screen.feature && input.enabledFeatures && !input.enabledFeatures.has(screen.feature)) return false;
  return true;
}

export function screensFor(input: ScreenAccessInput, area: ScreenDef["area"], opts?: { includeHidden?: boolean }): ScreenDef[] {
  return SCREEN_REGISTRY.filter((s) => s.area === area && (opts?.includeHidden || !s.hiddenInNav) && canAccessScreen(input, s));
}

/** Etki önizlemesi için: iki grant kümesi arasındaki fark ve açılan/kapanan ekranlar. */
export function diffGrants(before: Grant[], after: Grant[]) {
  const key = (x: Grant) => `${x.resource}:${x.action}:${x.scope}`;
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  const added = after.filter((x) => !b.has(key(x)));
  const removed = before.filter((x) => !a.has(key(x)));
  const opened = SCREEN_REGISTRY.filter((s) => !canAccessScreen({ grants: before }, s) && canAccessScreen({ grants: after }, s)).map((s) => s.label);
  const closed = SCREEN_REGISTRY.filter((s) => canAccessScreen({ grants: before }, s) && !canAccessScreen({ grants: after }, s)).map((s) => s.label);
  const risky = after.filter((x) => ["finance_summary", "collections", "export", "users", "roles", "contracts"].includes(x.resource) && !b.has(key(x)));
  return { added, removed, opened, closed, risks: risky.map((x) => `${PERM_RESOURCES[x.resource]}: ${x.action} (${x.scope})`) };
}
