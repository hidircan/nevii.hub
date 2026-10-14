/**
 * Expo Push gönderim katmanı — APNs/FCM taşıyıcı olarak Expo Push Service.
 * Fail-closed: `isPushActive()` false ise hiçbir HTTP çağrısı yapılmaz.
 * Token ham değeri loglanmaz (maskeli); `DeviceNotRegistered` cevabında
 * token devre dışı bırakılır. `fetchFn` enjekte edilebilir (testler).
 */
import { isPushActive, expoPushAccessToken } from "./config";
import { disableDevicePushTokens, listEnabledDevicePushTokens, maskPushToken } from "../device-push-tokens";
import { logger } from "../logger";

export type PushSendOutcome = "sent" | "skipped" | "failed" | "token-invalid";

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
};

type FetchFn = typeof fetch;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Kullanıcının etkin cihazlarına push gönderir. Önce push tercihi
 * (`pushEnabled`) kontrol edilir — kapalıysa gönderim YOK.
 */
export async function deliverPushForUser(
  tenantId: string,
  userId: string,
  category: string,
  message: PushMessage,
  opts?: { fetchFn?: FetchFn; ignorePreference?: boolean }
): Promise<{ outcome: PushSendOutcome; sent: number; invalidated: number }> {
  if (!isPushActive()) return { outcome: "skipped", sent: 0, invalidated: 0 };
  // `ignorePreference` YALNIZ dev/test "kendi cihazıma test bildirimi" akışı
  // içindir (kullanıcının açık tek-seferlik eylemi = rıza); diğer tüm
  // gönderimler kategori tercihine tabidir.
  if (!opts?.ignorePreference) {
    const { isPushEnabledForUser } = await import("../notification-preferences");
    if (!(await isPushEnabledForUser(tenantId, userId, category as never))) {
      return { outcome: "skipped", sent: 0, invalidated: 0 };
    }
  }
  const targets = await listEnabledDevicePushTokens(tenantId, userId);
  if (targets.length === 0) return { outcome: "skipped", sent: 0, invalidated: 0 };

  const fetchFn = opts?.fetchFn ?? fetch;
  const token = expoPushAccessToken();
  let sent = 0;
  let invalidated = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      const res = await fetchFn(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to: t.expoPushToken,
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          sound: "default",
          priority: "default",
          ...(t.platform === "android" && message.channelId ? { channelId: message.channelId } : {}),
        }),
      });
      const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
      const ticket = json.data?.[0];
      if (ticket?.status === "ok") {
        sent++;
      } else if (ticket?.details?.error === "DeviceNotRegistered") {
        await disableDevicePushTokens(tenantId, userId, t.expoPushToken);
        invalidated++;
      } else {
        failed++;
        logger.warn("push gönderimi başarısız", {
          tenantId,
          userId,
          token: maskPushToken(t.expoPushToken),
          status: ticket?.status ?? res.status,
        });
      }
    } catch (error) {
      failed++;
      logger.warn("push gönderimi hata", {
        tenantId,
        userId,
        token: maskPushToken(t.expoPushToken),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { outcome: sent > 0 ? "sent" : failed > 0 ? "failed" : "skipped", sent, invalidated };
}
