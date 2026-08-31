import { useApiGet } from "./use-api";
import type { NotificationsResponse } from "../types/api";

/** AppHeader'daki bildirim zili rozeti için okunmamış sayısı — `enabled=false` iken istek atmaz. */
export function useUnreadNotificationCount(enabled: boolean): number {
  const res = useApiGet<NotificationsResponse>(enabled ? "/api/v1/notifications" : "");
  if (res.status !== "success") return 0;
  return res.data.unreadCount ?? res.data.notifications.filter((n) => !n.readAt).length;
}
