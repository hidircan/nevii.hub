/**
 * Push kanal kimlikleri — mobil `expo-push-deps.ts` ile AYNI sabitler.
 * Android 8+ zorunlu: kanal yoksa bildirim HIGH öncelikle gösterilmez.
 * Mobil taraf bu iki kanalı açılışta oluşturur; sunucu `channelId` gönderir.
 */
import type { NotificationCategory } from "../notification-categories";

export const LESSON_PUSH_CHANNEL_ID = "lesson-reminders";
export const GENERAL_PUSH_CHANNEL_ID = "general";

/** Ders hatırlatmaları kendi kanalında; kalan tüm kategoriler genel kanalda. */
export function pushChannelForCategory(category: NotificationCategory): string {
  return category.startsWith("lesson_") ? LESSON_PUSH_CHANNEL_ID : GENERAL_PUSH_CHANNEL_ID;
}
