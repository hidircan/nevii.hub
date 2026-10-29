import { AppText } from "../../src/components/ui/app-text";

import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";
import { useLocale } from "../../src/i18n/locale-context";
import { fonts } from "../../src/theme/tokens";

type Notification = { id: string; title?: string; category?: string; readAt?: string | null; createdAt?: string };
type NotificationsResponse = { notifications: Notification[] };

export default function TeacherBildirimler() {
  const { t: tr } = useLocale();
  const res = useApiGet<NotificationsResponse>("/api/v1/notifications");
  return (
    <ListScreen
      title={tr("lists.notifTitle")}
      status={res.status}
      data={res.status === "success" ? res.data.notifications : undefined}
      errorMessage={res.status === "error" ? res.message : undefined}
      onRetry={res.refresh}
      emptyLabel={tr("lists.notifEmpty")}
      keyExtractor={(n) => n.id}
      renderItem={(n) => (
        <AppText style={{ fontFamily: fonts.regular, fontWeight: n.readAt ? "400" : "700", fontSize: 17 }}>{n.title ?? n.category ?? tr("lists.notifFallback")}</AppText>
      )}
    />
  );
}
