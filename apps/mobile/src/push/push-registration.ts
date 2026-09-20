import { Platform } from "react-native";
import { apiDelete } from "../api/client";

/**
 * Push kayıt istemcisi — Expo Push (APNs/FCM taşıyıcı).
 *
 * Akış: fiziksel cihaz mı → izin (mevcut + istek) → Android kanalı →
 * ExpoPushToken → POST /api/v1/mobile/push-tokens (kendi oturumu).
 *
 * Gizlilik: token değeri ASLA loglanmaz. İzin verilmediyse sunucuya
 * İSTEK YOK (kaydedilecek bir şey yok). Emülatör/simülatörde sessiz
 * atlanır — Expo push token'ı yalnız fiziksel cihazda üretilir.
 */

export type PushPermission = "granted" | "denied" | "undetermined";
export type PushAppVariant = "development" | "preview" | "production";

export type PushRegistrationResult =
  | { status: "registered" }
  | { status: "denied" }
  | { status: "skipped"; reason: "not-device" | "undetermined" | "server-rejected" | "network" };

export type PushDeps = {
  isDevice: () => boolean;
  getPermission: () => Promise<PushPermission>;
  requestPermission: () => Promise<PushPermission>;
  getExpoPushToken: () => Promise<string>;
  ensureAndroidChannel: () => Promise<void>;
  appVariant: () => PushAppVariant;
  deviceId: () => Promise<string | null>;
  postToken: (body: {
    expoPushToken: string;
    platform: "ios" | "android";
    appVariant: PushAppVariant;
    deviceId?: string;
    permission: PushPermission;
  }) => Promise<boolean>;
};

/** `EXPO_PUBLIC_APP_VARIANT=preview` EAS preview profili içindir; yoksa __DEV__ eşlemesi. */
export function resolveAppVariant(): PushAppVariant {
  const env = (process.env.EXPO_PUBLIC_APP_VARIANT ?? "").trim().toLowerCase();
  if (env === "development" || env === "preview" || env === "production") return env;
  return __DEV__ ? "development" : "production";
}

export async function registerPushToken(deps: PushDeps): Promise<PushRegistrationResult> {
  if (!deps.isDevice()) return { status: "skipped", reason: "not-device" };
  let permission = await deps.getPermission();
  if (permission !== "granted") permission = await deps.requestPermission();
  if (permission === "undetermined") return { status: "skipped", reason: "undetermined" };
  if (permission !== "granted") return { status: "denied" };
  try {
    await deps.ensureAndroidChannel();
    const expoPushToken = await deps.getExpoPushToken();
    if (!expoPushToken.startsWith("ExponentPushToken[")) {
      return { status: "skipped", reason: "server-rejected" };
    }
    const deviceId = await deps.deviceId();
    const ok = await deps.postToken({
      expoPushToken,
      platform: Platform.OS === "android" ? "android" : "ios",
      appVariant: deps.appVariant(),
      ...(deviceId ? { deviceId } : {}),
      permission: "granted",
    });
    return ok ? { status: "registered" } : { status: "skipped", reason: "server-rejected" };
  } catch {
    return { status: "skipped", reason: "network" };
  }
}

/** Çıkışta: bu kullanıcının TÜM cihaz token'ları devre dışı (body'siz DELETE). En iyi çaba. */
export async function unregisterPushTokens(): Promise<void> {
  try {
    await apiDelete("/api/v1/mobile/push-tokens");
  } catch {
    // yerel çıkış yine de tamamlanır
  }
}
