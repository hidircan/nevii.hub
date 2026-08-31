import { Text } from "react-native";
import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";

type Notification = { id: string; title?: string; category?: string; readAt?: string | null };
type NotificationsResponse = { notifications: Notification[] };

export default function ParentBildirimler() {
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
        <Text style={{ fontWeight: n.readAt ? "400" : "700", fontSize: 15 }}>{n.title ?? n.category ?? "Bildirim"}</Text>
      )}
    />
  );
}
