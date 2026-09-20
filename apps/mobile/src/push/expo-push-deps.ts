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

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(LESSON_REMINDER_CHANNEL_ID, {
    name: "Ders hatırlatmaları",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
  });
}

function permissionOf(status: Notifications.PermissionStatus): "granted" | "denied" | "undetermined" {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

const realDeps: PushDeps = {
  isDevice: () => Device.isDevice,
  getPermission: async () => permissionOf((await Notifications.getPermissionsAsync()).status),
  requestPermission: async () => permissionOf((await Notifications.requestPermissionsAsync()).status),
  getExpoPushToken: async () => (await Notifications.getExpoPushTokenAsync()).data,
  ensureAndroidChannel,
  appVariant: resolveAppVariant,
  deviceId: async () => null,
  postToken: async (body) => (await apiPost("/api/v1/mobile/push-tokens", body)).ok,
};

export function registerDeviceForPush() {
  return registerPushToken(realDeps);
}
