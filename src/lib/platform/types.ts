export const SETTING_SCOPES = ["platform", "plan", "tenant", "branch", "user"] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];

export const SETTING_VALUE_TYPES = [
  "string",
  "number",
  "boolean",
  "string_list",
  "enum",
  "json",
  "color",
] as const;
export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number];

export type SettingCategory =
  | "branding"
  | "locale"
  | "contact"
  | "lessons"
  | "makeup"
  | "attendance"
  | "homework"
  | "performance"
  | "feedback"
  | "curriculum"
  | "payments"
  | "collections"
  | "portals"
  | "mobile"
  | "ai"
  | "notifications"
  | "messaging"
  | "appearance"
  | "subscription"
  | "forms"
  | "policy"
  | "communication"
  | "auth"
  | "access"
  | "operations";

/**
 * Kurum yönetici izin preset'i. `unified`: BRANCH_MANAGER efektif olarak
 * SCHOOL_ADMIN izin setini kullanır (kurum geneli); `branch_scoped`: tur 2
 * davranışı (yalnız atanmış şube, /sube). Rol adları ayrı kalır.
 */
export const MANAGER_PRESETS = ["unified", "branch_scoped"] as const;
export type ManagerPreset = (typeof MANAGER_PRESETS)[number];

/**
 * Log retention kategorileri. `CRITICAL_*` asla otomatik silinmez (kod
 * düzeyinde sabit; ayarla değiştirilemez). Diğerleri gün bazlı politika.
 */
export const CRITICAL_RETENTION_CATEGORIES = ["finance_audit", "role_audit", "support_access", "platform_config_audit"] as const;
export const DELETABLE_RETENTION_CATEGORIES = ["security_events", "session_presence", "api_telemetry", "error_logs", "debug_logs"] as const;
export type RetentionCategory =
  | (typeof CRITICAL_RETENTION_CATEGORIES)[number]
  | (typeof DELETABLE_RETENTION_CATEGORIES)[number];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type SettingDefinition = {
  key: string;
  category: SettingCategory;
  type: SettingValueType;
  defaultValue: JsonValue;
  description: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  critical: boolean;
  /** Kullanıcı tercihi katmanına izin verilir (5. öncelik). */
  userPreference?: boolean;
  /** NeviiOS: yalnız HYPER_ADMIN yazar; kurum rolleri yalnız okur (paket, görünüm, tür). */
  platformOnly?: boolean;
  version: number;
};

export type SettingOverride = {
  scopeType: SettingScope;
  scopeId: string;
  key: string;
  value: JsonValue;
  updatedAt: string;
  updatedBy: string;
};

export type ResolvedSetting = {
  key: string;
  category: SettingCategory;
  type: SettingValueType;
  defaultValue: JsonValue;
  effectiveValue: JsonValue;
  sourceScope: SettingScope;
  description: string;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  critical: boolean;
  enumValues?: string[];
  platformOnly?: boolean;
};

export const FEATURE_FLAGS = [
  "homework",
  "curriculum",
  "teacherPerformanceV2",
  "teacherFeedback",
  "studentFeedback",
  "payments",
  "collections",
  "teacherPayouts",
  "tasks",
  "crm",
  "documents",
  "announcements",
  "whatsapp",
  "sms",
  "aiAssistant",
  "mobileApp",
  "parentPortal",
  "studentPortal",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export type FeatureFlagDefinition = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  /** Kapatılırsa sistem kırılır — kimse kapatamaz. */
  required: boolean;
  critical: boolean;
  /** SUPER_ADMIN kendi kurumunda yönetebilir. */
  institutionManageable: boolean;
};

export type FeatureFlagOverride = {
  tenantId: string;
  flagKey: FeatureFlagKey;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

export type ResolvedFeatureFlag = FeatureFlagDefinition & {
  enabled: boolean;
  /** Ticari hak (paket + eklenti + platform override). false ise bayrak açılamaz. */
  entitled: boolean;
  entitlementSource: "plan" | "addon" | "override" | "none";
  sourceScope: SettingScope;
  locked: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const LIMIT_KINDS = ["students", "users", "branches"] as const;
export type LimitKind = (typeof LIMIT_KINDS)[number];

export const INSTITUTION_TYPES = ["music", "art", "sports", "dance", "yoga_pilates", "course", "other"] as const;

/**
 * NeviiOS paket anahtarları. `standard` ve `professional` legacy (mevcut
 * kurumların davranışı değişmesin diye korunur); yeni kurumlar
 * starter / core / pro / scale / enterprise kullanır.
 */
export const PLAN_KEYS = ["starter", "core", "pro", "scale", "enterprise", "standard", "professional"] as const;
export type BuiltinPlanKey = (typeof PLAN_KEYS)[number];
/**
 * Tur 3: paketler NeviiOS kataloğundan yönetilir; yerleşik anahtarlara ek
 * olarak katalogda oluşturulan anahtarlar da geçerlidir (biçim aşağıda,
 * varlık `commercial-catalog.ts` ile doğrulanır).
 */
export type PlanKey = string;
export const PLAN_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

/** Wizard'da sunulan başlangıç planları (standard geriye dönük uyumluluk). */
export const WIZARD_PLAN_KEYS = ["starter", "core", "pro", "scale", "enterprise"] as const;
export type WizardPlanKey = (typeof WIZARD_PLAN_KEYS)[number];

/**
 * Aktif abonelik snapshot'ı (kurum ayarı `subscription.snapshot`). Paket
 * kataloğu değişse de kurumun limit/modül/fiyatı bu kopyadan çözülür;
 * katalog değişiklikleri yalnız YENİ aboneliklere uygulanır.
 */
export type SubscriptionSnapshot = {
  planKey: string;
  planLabel: string;
  catalogVersion: number | null;
  limits: Record<LimitKind, number | null>;
  includedModules: FeatureFlagKey[];
  pricing: {
    currency: "TRY";
    mode: "list" | "custom_quote";
    basePriceMonthlyMinor: number;
    basePriceYearlyMinor: number;
    modulePricesMonthlyMinor: Partial<Record<FeatureFlagKey, number>>;
    modulePricesYearlyMinor: Partial<Record<FeatureFlagKey, number>>;
    published: boolean;
  };
  subscribedAt: string;
  subscribedBy: string;
};

export const TENANT_LIFECYCLES = ["draft", "provisioning", "active", "suspended", "archived"] as const;
export type TenantLifecycle = (typeof TENANT_LIFECYCLES)[number];

export type TenantFirstBranchDraft = {
  name: string;
  address: string;
  phone: string;
  city?: string;
  workingDays: number[];
  lessonDurationMinutes: number;
};

export type TenantOwnerDraft = {
  name: string;
  email: string;
  phone?: string;
};

export type TenantDraftPayload = {
  shortName: string;
  contactEmail: string;
  phone: string;
  country: string;
  timezone: string;
  currency: string;
  language: string;
  colorPrimary: string;
  logoUrl: string;
  features: Partial<Record<FeatureFlagKey, boolean>>;
  firstBranch: TenantFirstBranchDraft | null;
  owner: TenantOwnerDraft | null;
};

export type PlatformTenant = {
  tenantId: string;
  name: string;
  slug: string;
  active: boolean;
  lifecycle: TenantLifecycle;
  planKey: PlanKey;
  shortName: string;
  contactEmail: string;
  phone: string;
  country: string;
  timezone: string;
  currency: string;
  language: string;
  colorPrimary: string;
  logoUrl: string;
  provisionError: string | null;
  idempotencyKey: string | null;
  draft: TenantDraftPayload | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerInvitationRecord = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string | null;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string;
  /** Null → kurum sahibi (SUPER_ADMIN). Asla HYPER_ADMIN olamaz. */
  role?: string | null;
  branchIds?: string[] | null;
};

export type PublicOwnerInvitation = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string | null;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  role: string;
  branchIds: string[];
  status: "pending" | "used" | "expired" | "revoked";
};

export type ProvisionRun = {
  id: string;
  tenantId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "blocked";
  steps: { id: string; label: string; ok: boolean; detail?: string }[];
  error: string | null;
  actorUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAuditEvent = {
  id: string;
  actorUserId: string;
  actorRole: string;
  actorTenantId: string;
  targetTenantId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: JsonValue | null;
  after: JsonValue | null;
  requestId: string;
  outcome: "success" | "denied" | "error";
  createdAt: string;
};

export const INTEGRATION_KINDS = ["sms", "whatsapp", "email", "payments", "ai"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export type IntegrationConnection = {
  id: string;
  scopeType: "platform" | "tenant";
  scopeId: string;
  provider: string;
  kind: IntegrationKind;
  status: "not_configured" | "configured" | "connected" | "error";
  lastVerifiedAt: string | null;
  secretLast4: string | null;
  /** Secret asla burada tutulmaz. */
  secretStored: boolean;
  config: Record<string, JsonValue>;
  updatedAt: string;
  updatedBy: string;
};

export type PlatformState = {
  version: 1;
  tenants: PlatformTenant[];
  settingOverrides: SettingOverride[];
  featureOverrides: FeatureFlagOverride[];
  auditEvents: PlatformAuditEvent[];
  integrations: IntegrationConnection[];
  invitations: OwnerInvitationRecord[];
  provisionRuns: ProvisionRun[];
  branchAccess?: UserBranchAccess[];
  supportSessions?: SupportAccessSession[];
  userStates?: UserLifecycleState[];
  policyVersions?: PolicyVersion[];
  tenantRoles?: TenantCustomRole[];
  roleAssignments?: UserRoleAssignment[];
  passwordResets?: PasswordResetRecord[];
  sessions?: UserSessionRecord[];
  releases?: ReleaseManifest[];
  deployments?: DeploymentRecord[];
};

/**
 * NeviiOS oturum kaydı (tekil oturum sonlandırma). Presence (son görülme,
 * son ekran) süreç içi önbellekte tutulur ve en fazla birkaç dakikada bir
 * buraya yazılır — audit tablosuna asla yazılmaz.
 */
export type UserSessionRecord = {
  id: string;
  userId: string;
  tenantId: string;
  role: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  /** "Chrome · macOS" gibi kısa özet; ham user-agent/IP saklanmaz. */
  device: string | null;
  lastPath: string | null;
  lastAction: string | null;
};

export const RELEASE_ENVIRONMENTS = ["local", "preview", "test", "production"] as const;
export type ReleaseEnvironment = (typeof RELEASE_ENVIRONMENTS)[number];
export const RELEASE_PRODUCTS = ["neviihub", "neviios"] as const;
export type ReleaseProduct = (typeof RELEASE_PRODUCTS)[number];
export const CHECK_STATUSES = ["unknown", "pending", "passed", "failed"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** Git commit referansı — release'den ve deployment'tan AYRI kavram; commit otomatik release değildir. */
export type CommitRef = { sha: string; branch: string; prNumber: number | null; prUrl: string | null };

export type ReleaseMigration = { name: string; status: "pending" | "applied" | "unknown"; appliedAt: string | null };

/**
 * ReleaseManifest — bir yayının tanımı (ne yayınlanıyor). Deployment
 * (nereye/ne zaman dağıtıldı) ayrı kayıttır ve release'e opsiyonel bağlanır.
 * `source` verinin nereden geldiğini gösterir; V1'de yalnız "manual"
 * (platform sahibi girdi) — canlı GitHub/Vercel verisi taklit edilmez.
 */
export type ReleaseManifest = {
  id: string;
  product: ReleaseProduct;
  name: string;
  version: string;
  commit: CommitRef;
  environment: ReleaseEnvironment;
  deploymentUrl: string | null;
  build: CheckStatus;
  tests: CheckStatus;
  migrations: ReleaseMigration[];
  rollbackTarget: string | null;
  affectedTenants: string[] | "all";
  affectedModules: string[];
  summary: string;
  technicalNotes: string;
  knownRisks: string;
  publishedBy: string;
  publishedAt: string;
  source: "manual" | "signed_ci_event";
  createdAt: string;
};

export type DeploymentRecord = {
  id: string;
  product: ReleaseProduct;
  provider: "vercel" | "manual";
  environment: ReleaseEnvironment;
  url: string | null;
  commitSha: string;
  branch: string;
  status: "queued" | "building" | "ready" | "error" | "canceled" | "unknown";
  releaseId: string | null;
  createdAt: string;
  recordedBy: string;
  source: "manual" | "signed_ci_event" | "provider";
};

/**
 * NeviiOS kullanıcı yaşam döngüsü. db modunda User kolonlarıdır
 * (active/deletedAt/sessionsRevokedAt/displayName); json/memory modunda
 * koddaki demo hesapların üzerine bu kayıt bindirilir (mode parity).
 */
export type UserLifecycleState = {
  userId: string;
  tenantId: string;
  status: "active" | "deactivated" | "deleted";
  /** Bu andan önce üretilmiş tüm token'lar geçersizdir (saniye hassasiyeti). */
  sessionsRevokedAt: string | null;
  displayName: string | null;
  updatedAt: string;
  updatedBy: string;
};

export const POLICY_VERSION_STATUSES = ["draft", "published", "superseded", "discarded"] as const;

/** Kritik politika sürümü — silinmez; geri alma yeni bir sürüm üretir. */
export type PolicyVersion = {
  id: string;
  /** "platform" veya tenantId */
  scopeId: string;
  key: string;
  version: number;
  status: (typeof POLICY_VERSION_STATUSES)[number];
  value: JsonValue;
  reason: string;
  createdBy: string;
  createdAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  rollbackOfVersion: number | null;
};

/** Kurum özel rolü — yalnız tenant kapsamlı; platform izni taşıyamaz. */
export type TenantCustomRole = {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  grants: { resource: string; action: string; scope: string }[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type UserRoleAssignment = {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
};

/** Şifre sıfırlama — ham token saklanmaz (SHA-256), tek kullanımlık, kısa ömürlü. */
export type PasswordResetRecord = {
  id: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

/** NeviiOS — kullanıcı ↔ şube erişimi (çoklu şube). Kayıt yoksa erişim YOK (fail-closed). */
export type UserBranchAccess = {
  id: string;
  tenantId: string;
  userId: string;
  branchId: string;
  grantedBy: string;
  createdAt: string;
  revokedAt: string | null;
};

/** NeviiOS — süreli, gerekçeli, salt-okur platform destek erişimi. */
export type SupportAccessSession = {
  id: string;
  tenantId: string;
  actorUserId: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: string | null;
};
