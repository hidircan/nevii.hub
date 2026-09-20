import { Text } from "react-native";
import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";
import { fonts } from "../../src/theme/tokens";

type Notification = { id: string; title?: string; category?: string; readAt?: string | null; createdAt?: string };
type NotificationsResponse = { notifications: Notification[] };

export default function TeacherBildirimler() {
  const res = useApiGet<NotificationsResponse>("/api/v1/notifications");
  return (
    <ListScreen
      title="Bildirimler"
      status={res.status}
      data={res.status === "success" ? res.data.notifications : undefined}
      errorMessage={res.status === "error" ? res.message : undefined}
      onRetry={res.refresh}
      emptyLabel="Bildirim yok."
      keyExtractor={(n) => n.id}
      renderItem={(n) => (
        <Text style={{ fontFamily: fonts.serif, fontWeight: n.readAt ? "400" : "700", fontSize: 17 }}>{n.title ?? n.category ?? "Bildirim"}</Text>
      )}
    />
  );
}
