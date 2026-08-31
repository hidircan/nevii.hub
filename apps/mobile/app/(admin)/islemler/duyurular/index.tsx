import { useRouter } from "expo-router";
import { View } from "react-native";
import { AnnouncementCard, AppHeader, EmptyState, ErrorState, FloatingActionButton, LoadingSkeleton, Screen } from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../../src/hooks/use-focus-refetch";
import type { AnnouncementsResponse } from "../../../../src/types/api";

export default function AdminDuyurularIndex() {
  const router = useRouter();
  const res = useApiGet<AnnouncementsResponse>("/api/v1/announcements/manage");
  useFocusRefetch(res.refresh);
  const announcements = res.status === "success" ? [...res.data.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  return (
    <Screen
      floatingAction={<FloatingActionButton icon="add" accessibilityLabel="Yeni duyuru" onPress={() => router.push("/(admin)/islemler/duyurular/yeni")} />}
    >
      <AppHeader title="Duyurular" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : announcements.length === 0 ? (
        <EmptyState icon="megaphone-outline" title="Henüz duyuru yok" actionLabel="Yeni duyuru" onAction={() => router.push("/(admin)/islemler/duyurular/yeni")} />
      ) : (
        <View style={{ gap: 10 }}>
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </View>
      )}
    </Screen>
  );
}
