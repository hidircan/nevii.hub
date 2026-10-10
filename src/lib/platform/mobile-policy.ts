import { ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { resolveAllFeatures, resolveAllSettings } from "./resolve";
import type { JsonValue } from "./types";

/**
 * NeviiOS mobil platform policy — YALNIZ config/policy. App Store / Google
 * Play API'si, gerçek build veya push gönderimi yoktur; bu modül mobil
 * uygulamanın tükettiği efektif kararı üretir:
 *
 *   izin = entitlement(mobileApp) AND feature flag AND mobile.appEnabled
 *          AND platform (ios/android) AND rol portalı AND tenant kapsamı
 */
export type MobilePlatform = "ios" | "android";

export type MobilePolicyDecision = {
  allowed: boolean;
  reasons: string[];
  platform: MobilePlatform | null;
  maintenance: { active: boolean; message: string };
  minVersion: { ios: string; android: string };
  updateRequired: boolean;
  push: { policy: "disabled" | "allowed"; providerConfigured: boolean; active: boolean; note: string };
  contractVersion: 1;
  /** Tur 3 (additive): kurum config sürümü — istemci önbelleğini bununla tazeler (bkz. /api/v1/config/snapshot). */
  configVersion: number;
};

/**
 * Control Center (2026-09-28) — mobil kontrol matrisi: her kontrol için
 * paket hakkı / platform-kurum değeri / efektif sonuç / istemci etkisi
 * ayrımı. Aç/kapa düğmesi paket hakkı YOKSA yetki vermiş gibi davranmaz
 * (entitled=false → efektif kapalı, sunucu da reddeder).
 */
export type MobileControlKey =
  | "app"
  | "ios"
  | "android"
  | "studentPortal"
  | "teacherPortal"
  | "adminPortal"
  | "maintenance"
  | "minVersion"
  | "push";

export type MobileControlRow = {
  key: MobileControlKey;
  label: string;
  /** Ticari hak: mobileApp modülü pakette/eklentide/override'da mı. */
  entitled: boolean;
  entitlementSource: string;
  /** Platform→kurum çözümlemesinin efektif değeri ve kaynağı. */
  settingValue: JsonValue;
  settingSource: string;
  /** Efektif sonuç (hak AND ayar). */
  effective: boolean;
  /** İstemciye yansıma (Expo uygulamasının gerçek davranışı). */
  clientEffect: string;
  /** true = snapshot/policy pull ile uzaktan değişir; false = yeni mobil sürüm gerektirir. */
  remote: boolean;
  /** Kullanıcıyı etkileyen tehlikeli ayar için açık uyarı (yoksa null). */
  danger: string | null;
};

/**
 * Uzaktan değişen anahtarlar (snapshot + policy pull, yeni binary gerekmez)
 * ile yeni mobil sürüm gerektiren öğeler ayrımı — mobil sayfada vaat
 * olarak gösterilir, istemciye "canlı değişir" diye söz verilmez.
 */
export const MOBILE_REMOTE_KEYS = [
  "mobile.appEnabled",
  "mobile.iosEnabled",
  "mobile.androidEnabled",
  "mobile.studentPortalEnabled",
  "mobile.teacherPortalEnabled",
  "mobile.adminPortalEnabled",
  "mobile.maintenanceMessage",
  "mobile.minVersion",
  "mobile.pushPolicy",
  "institution.name",
  "institution.logoUrl",
  "institution.loginMessage",
  "institution.colorPrimary",
  "institution.colorAccent",
] as const;

/** Yeni mobil binary gerektiren öğeler (uzaktan AÇILAMAZ). */
export const MOBILE_BINARY_REQUIRED: { label: string; detail: string }[] = [
  {
    label: "Push gönderim altyapısı (APNs/FCM)",
    detail: "Sağlayıcı bağlı değil; politika 'izinli' olsa bile bildirim gönderilmez. Bağlantı yeni sürüm + sunucu entegrasyonu ister.",
  },
  {
    label: "Yeni portal ekranları ve istemci özellikleri",
    detail: "Snapshot'ta olmayan yeni ekran/yetenek mağaza sürümüyle gelir; bayrakla uzaktan açılamaz.",
  },
  {
    label: "Mağaza listeleme ve ikon/splash varlıkları",
    detail: "Uygulama ikonu, açılış görseli ve mağaza metinleri binary'e gömülüdür.",
  },
];

const MOBILE_SETTING_KEY: Record<Exclude<MobileControlKey, "maintenance" | "minVersion" | "push">, string> = {
  app: "mobile.appEnabled",
  ios: "mobile.iosEnabled",
  android: "mobile.androidEnabled",
  studentPortal: "mobile.studentPortalEnabled",
  teacherPortal: "mobile.teacherPortalEnabled",
  adminPortal: "mobile.adminPortalEnabled",
};

const MOBILE_CONTROL_LABEL: Record<MobileControlKey, string> = {
  app: "Genel mobil erişim",
  ios: "iOS uygulaması",
  android: "Android uygulaması",
  studentPortal: "Öğrenci/veli portalı",
  teacherPortal: "Öğretmen portalı",
  adminPortal: "Yönetici portalı",
  maintenance: "Bakım modu",
  minVersion: "Minimum sürüm",
  push: "Push politikası",
};

const MOBILE_CLIENT_EFFECT: Record<MobileControlKey, string> = {
  app: "Kapalıyken uygulama giriş sonrası 'mobil erişim kapalı' ekranına düşer; tüm portallar kapanır.",
  ios: "Kapalıyken iOS cihazlarda giriş sonrası erişim ekranı gösterilir.",
  android: "Kapalıyken Android cihazlarda giriş sonrası erişim ekranı gösterilir.",
  studentPortal: "Kapalıyken öğrenci/veli hesapları 'portal kapalı' ekranına düşer.",
  teacherPortal: "Kapalıyken öğretmen hesapları 'portal kapalı' ekranına düşer.",
  adminPortal: "Kapalıyken yönetici hesapları 'portal kapalı' ekranına düşer (varsayılan kapalı — güvenli varsayılan).",
  maintenance: "Mesaj doluyken TÜM mobil kullanıcılar bakım ekranını görür (giriş yapılamaz).",
  minVersion: "Altında kalan sürümler güncelleme ekranına düşer (oturum açılmaz).",
  push: "Sağlayıcı bağlı olmadığı için her durumda gönderim yapılmaz; yalnız görünürlük/politika yönetilir.",
};

export async function getMobileControlMatrix(tenantId: string): Promise<ServiceResult<{ rows: MobileControlRow[] }>> {
  const [settings, features] = await Promise.all([resolveAllSettings({ tenantId }), resolveAllFeatures(tenantId)]);
  const v = (k: string) => settings.find((s) => s.key === k);
  const mobile = features.find((f) => f.key === "mobileApp");
  const entitled = mobile?.entitled ?? false;
  const entitlementSource = mobile?.entitlementSource ?? "none";

  const toggleRow = (key: Exclude<MobileControlKey, "maintenance" | "minVersion" | "push">): MobileControlRow => {
    const settingKey = MOBILE_SETTING_KEY[key];
    const setting = v(settingKey);
    const on = setting?.effectiveValue === true;
    const effective = entitled && on;
    const dangerousOff = (key === "app" || key === "studentPortal" || key === "teacherPortal") && entitled && !on;
    return {
      key,
      label: MOBILE_CONTROL_LABEL[key],
      entitled,
      entitlementSource,
      settingValue: setting?.effectiveValue ?? null,
      settingSource: setting?.sourceScope ?? "platform",
      effective,
      clientEffect: MOBILE_CLIENT_EFFECT[key],
      remote: true,
      danger: !entitled
        ? "Paket mobil hakkını içermiyor — bu anahtar açılsa bile erişim verilmez (sunucu reddeder)."
        : dangerousOff
          ? "Kullanıcıları etkiler: bu portalın kullanıcıları uygulamaya giremez. Değişiklik denetim kaydına yazılır."
          : null,
    };
  };

  const maintenanceSetting = v("mobile.maintenanceMessage");
  const maintenanceMessage = String(maintenanceSetting?.effectiveValue ?? "");
  const maintenanceActive = maintenanceMessage.trim().length > 0;
  const minSetting = v("mobile.minVersion");
  const minVersion = (minSetting?.effectiveValue as { ios: string; android: string } | undefined) ?? {
    ios: "1.0.0",
    android: "1.0.0",
  };
  const pushSetting = v("mobile.pushPolicy");
  const pushAllowed = pushSetting?.effectiveValue === "allowed";

  return ok({
    rows: [
      toggleRow("app"),
      toggleRow("ios"),
      toggleRow("android"),
      toggleRow("studentPortal"),
      toggleRow("teacherPortal"),
      toggleRow("adminPortal"),
      {
        key: "maintenance",
        label: MOBILE_CONTROL_LABEL.maintenance,
        entitled,
        entitlementSource,
        settingValue: maintenanceSetting?.effectiveValue ?? "",
        settingSource: maintenanceSetting?.sourceScope ?? "platform",
        effective: entitled && maintenanceActive,
        clientEffect: MOBILE_CLIENT_EFFECT.maintenance,
        remote: true,
        danger: maintenanceActive
          ? "Kullanıcıları etkiler: mesaj dolu olduğu sürece kimse mobil uygulamayı kullanamaz. Boşaltmak güvenli varsayılana döndürür."
          : null,
      },
      {
        key: "minVersion",
        label: MOBILE_CONTROL_LABEL.minVersion,
        entitled,
        entitlementSource,
        settingValue: (minSetting?.effectiveValue as JsonValue) ?? { ios: "1.0.0", android: "1.0.0" },
        settingSource: minSetting?.sourceScope ?? "platform",
        effective: entitled,
        clientEffect: `${MOBILE_CLIENT_EFFECT.minVersion} (iOS ≥ ${minVersion.ios}, Android ≥ ${minVersion.android})`,
        remote: true,
        danger: "Yükseltmek eski sürümleri dışarıda bırakır; duyurulmadan yükseltmeyin.",
      },
      {
        key: "push",
        label: MOBILE_CONTROL_LABEL.push,
        entitled,
        entitlementSource,
        settingValue: pushSetting?.effectiveValue ?? "disabled",
        settingSource: pushSetting?.sourceScope ?? "platform",
        effective: false,
        clientEffect: pushAllowed
          ? "Politika 'izinli' ama sağlayıcı bağlı değil: durum 'hazır değil' gösterilir, gönderim yapılmaz."
          : MOBILE_CLIENT_EFFECT.push,
        remote: true,
        danger: null,
      },
    ],
  });
}

const ROLE_PORTAL_KEY: Record<string, string | undefined> = {
  STUDENT: "mobile.studentPortalEnabled",
  TEACHER: "mobile.teacherPortalEnabled",
  SUPER_ADMIN: "mobile.adminPortalEnabled",
  SCHOOL_ADMIN: "mobile.adminPortalEnabled",
  BRANCH_MANAGER: "mobile.adminPortalEnabled",
};

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function getMobilePolicy(
  ctx: ServiceContext,
  opts?: { platform?: MobilePlatform; appVersion?: string }
): Promise<ServiceResult<MobilePolicyDecision>> {
  const { computeConfigVersion } = await import("./config-snapshot");
  const [settings, features, configVersion] = await Promise.all([
    resolveAllSettings({ tenantId: ctx.tenantId }),
    resolveAllFeatures(ctx.tenantId),
    computeConfigVersion(ctx.tenantId),
  ]);
  const v = (k: string) => settings.find((s) => s.key === k)?.effectiveValue;
  const reasons: string[] = [];
  const mobile = features.find((f) => f.key === "mobileApp");
  if (!mobile?.entitled) reasons.push("Paket mobil uygulamayı içermiyor.");
  else if (!mobile.enabled) reasons.push("Mobil uygulama modülü kurum için kapalı.");
  if (v("mobile.appEnabled") !== true) reasons.push("Mobil portal kapalı.");
  if (opts?.platform === "ios" && v("mobile.iosEnabled") !== true) reasons.push("iOS uygulaması kapalı.");
  if (opts?.platform === "android" && v("mobile.androidEnabled") !== true) reasons.push("Android uygulaması kapalı.");
  const portalKey = ROLE_PORTAL_KEY[ctx.role];
  if (!portalKey) reasons.push("Bu rol için mobil portal yok.");
  else if (v(portalKey) !== true) reasons.push("Bu rolün mobil portalı kapalı.");

  const minVersion = (v("mobile.minVersion") as { ios: string; android: string } | undefined) ?? { ios: "1.0.0", android: "1.0.0" };
  const updateRequired = Boolean(
    opts?.platform && opts.appVersion && /^\d+\.\d+\.\d+$/.test(opts.appVersion) && compareSemver(opts.appVersion, minVersion[opts.platform]) < 0
  );
  const message = String(v("mobile.maintenanceMessage") ?? "");
  // Push gerçek durumu — secret değer ASLA yanıta girmez, yalnız boole bayraklar.
  const { isPushActive } = await import("../push/config");
  const providerConfigured = !!process.env.EXPO_PUSH_ACCESS_TOKEN;
  const pushActive = isPushActive();
  return ok({
    allowed: reasons.length === 0,
    reasons,
    platform: opts?.platform ?? null,
    maintenance: { active: message.trim().length > 0, message },
    minVersion,
    updateRequired,
    push: {
      policy: v("mobile.pushPolicy") === "allowed" ? "allowed" : "disabled",
      providerConfigured,
      active: pushActive,
      note: pushActive
        ? "Push gönderimi etkin (Expo Push Service)."
        : "Push gönderimi kapalı; bildirim gönderilmez (PUSH_ENABLED + EXPO_PUSH_ACCESS_TOKEN gerekli).",
    },
    contractVersion: 1,
    configVersion,
  });
}
