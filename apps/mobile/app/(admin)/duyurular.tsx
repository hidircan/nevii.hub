import { Text } from "react-native";
import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";

type Announcement = { id: string; title: string; body: string; createdAt: string; pinned?: boolean };
type AnnouncementsResponse = { announcements: Announcement[] };

export default function AdminDuyurular() {
  const res = useApiGet<AnnouncementsResponse>("/api/v1/announcements");
  return (
    <ListScreen
      title="Duyurular"
      status={res.status}
      data={res.status === "success" ? res.data.announcements : undefined}
      errorMessage={res.status === "error" ? res.message : undefined}
      onRetry={res.refresh}
      emptyLabel="Henüz duyuru yok."
      keyExtractor={(a) => a.id}
      renderItem={(a) => (
        <>
          <Text style={{ fontWeight: "700", fontSize: 15 }}>
            {a.pinned ? "📌 " : ""}
            {a.title}
          </Text>
          <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, opacity: 0.7 }}>
            {a.body}
          </Text>
        </>
      )}
    />
  );
}
