import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiPost } from "../api/client";
import { registerPushToken, resolveAppVariant, type PushDeps } from "./push-registration";

/**
 * Gerçek Expo bağımlılıklarıyla kayıt — `usePushNotifications` bunu çağırır.
 * Testler `registerPushToken`'ı sahte `PushDeps` ile kullanır (bu dosya mock'lanmaz).
 */

export const LESSON_REMINDER_CHANNEL_ID = "lesson-reminders";
/** Sunucu `push/channels.ts` ile AYNI kimlik — ders dışı bildirimler. */
export const GENERAL_CHANNEL_ID = "general";

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(LESSON_REMINDER_CHANNEL_ID, {
      name: "Ders hatırlatmaları",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    }),
    Notifications.setNotificationChannelAsync(GENERAL_CHANNEL_ID, {
      name: "Genel bildirimler",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    }),
  ]);
}

function permissionOf(status: Notifications.PermissionStatus): "granted" | "denied" | "undetermined" {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

/**
 * EAS projectId — development/preview/production build'lerde push token için
 * ZORUNLU (`eas init` yazar, app.json `extra.eas.projectId`). Expo Go'da
 * tanımsız olabilir (o zaman argümansız çağrı denenir).
 */
function easProjectId(): string | undefined {
  const id = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

const realDeps: PushDeps = {
  isDevice: () => Device.isDevice,
  getPermission: async () => permissionOf((await Notifications.getPermissionsAsync()).status),
  requestPermission: async () => permissionOf((await Notifications.requestPermissionsAsync()).status),
  getExpoPushToken: async () => {
    const projectId = easProjectId();
    return (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  },
  ensureAndroidChannel,
  appVariant: resolveAppVariant,
  deviceId: async () => null,
  postToken: async (body) => (await apiPost("/api/v1/mobile/push-tokens", body)).ok,
};

export function registerDeviceForPush() {
  return registerPushToken(realDeps);
}
