import { ok, type ServiceResult } from "../services/result";
import type { ServiceContext } from "../services/context";
import { resolveAllFeatures, resolveAllSettings } from "./resolve";

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
  push: { policy: "disabled" | "allowed"; providerConfigured: false; active: false; note: string };
  contractVersion: 1;
  /** Tur 3 (additive): kurum config sürümü — istemci önbelleğini bununla tazeler (bkz. /api/v1/config/snapshot). */
  configVersion: number;
};

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
  return ok({
    allowed: reasons.length === 0,
    reasons,
    platform: opts?.platform ?? null,
    maintenance: { active: message.trim().length > 0, message },
    minVersion,
    updateRequired,
    push: {
      policy: v("mobile.pushPolicy") === "allowed" ? "allowed" : "disabled",
      providerConfigured: false,
      active: false,
      note: "Push sağlayıcısı (APNs/FCM) bağlı değil; bildirim gönderilmez.",
    },
    contractVersion: 1,
    configVersion,
  });
}
