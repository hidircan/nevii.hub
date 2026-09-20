import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { personaOf, useAuth } from "../auth/auth-context";
import { useChildSelection } from "../student/student-context";
import { registerDeviceForPush } from "./expo-push-deps";
import { resolvePushDestination, type PushPayload } from "./push-destination";

// Ön-plan bildirimi: sistem tepsisine düşsün, uygulama içi banner şişirmesin.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/**
 * Oturum açıkken bir kez push kaydı + dokunma → deep-link.
 * Kayıt `userId` başına bir kez (token yenileme/ekran dönüşlerinde tekrar YOK).
 *
 * İki tamamlayıcı yol:
 * - Foreground/background dokunuşu: `addNotificationResponseReceivedListener`.
 * - Killed (uygulama kapalıyken) dokunuşu: `useLastNotificationResponse` —
 *   açılışta bir kez işlenir, tekrar YOK.
 *
 * Veli çoklu-çocuk: payload'daki `studentId` sunucu listesine karşı
 * doğrulanarak seçilir (`select`), sonra hedefe gidilir — yanlış çocuğun
 * ekranı ASLA açılmaz (geçersiz ID'de seçim değişmez).
 */
export function usePushNotifications() {
  const { status, user } = useAuth();
  const router = useRouter();
  const { select } = useChildSelection();
  const registeredFor = useRef<string | null>(null);
  const handledKilled = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (status !== "signedIn" || !user) return;
    if (registeredFor.current === user.userId) return;
    registeredFor.current = user.userId;
    void registerDeviceForPush().then((r) => {
      if (__DEV__ && r.status !== "registered") console.log(`[push] kayıt atlandı: ${r.status}`);
    });
  }, [status, user]);

  useEffect(() => {
    if (status !== "signedIn" || !user) return;
    const persona = personaOf(user);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as PushPayload;
      void handlePushPayload(data, persona, select, (href) => router.push(href as never));
    });
    return () => sub.remove();
  }, [status, user, router, select]);

  useEffect(() => {
    if (status !== "signedIn" || !user || !lastResponse) return;
    const key = lastResponse.notification.request.identifier;
    if (handledKilled.current === key) return;
    handledKilled.current = key;
    const persona = personaOf(user);
    const data = (lastResponse.notification.request.content.data ?? {}) as PushPayload;
    void handlePushPayload(data, persona, select, (href) => router.push(href as never));
  }, [status, user, lastResponse, router, select]);
}

/** Saf olmayan kısım test-dışıdır; karar mantığı `push-destination`'dadır. */
async function handlePushPayload(
  data: PushPayload,
  persona: ReturnType<typeof personaOf>,
  select: (studentId: string) => Promise<boolean>,
  push: (href: string) => void
): Promise<void> {
  if (persona === "parent" && typeof data.studentId === "string" && data.studentId) {
    await select(data.studentId);
  }
  push(resolvePushDestination(data, persona));
}
