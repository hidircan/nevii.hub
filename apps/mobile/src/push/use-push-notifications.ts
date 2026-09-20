import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { personaOf, useAuth } from "../auth/auth-context";
import { registerDeviceForPush } from "./expo-push-deps";
import { resolvePushDestination, type PushPayload } from "./push-destination";

// Ön-plan bildirimi: sistem tepsisine düşsün, uygulama içi banner şişirmesin.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/**
 * Oturum açıkken bir kez push kaydı + dokunma → deep-link.
 * Kayıt `userId` başına bir kez (token yenileme/ekran dönüşlerinde tekrar YOK).
 */
export function usePushNotifications() {
  const { status, user } = useAuth();
  const router = useRouter();
  const registeredFor = useRef<string | null>(null);

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
      router.push(resolvePushDestination(data, persona) as never);
    });
    return () => sub.remove();
  }, [status, user, router]);
}
