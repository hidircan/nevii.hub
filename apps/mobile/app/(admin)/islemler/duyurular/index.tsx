import { useRouter } from "expo-router";
import { View } from "react-native";
import { AnnouncementCard, AppHeader, EmptyState, ErrorState, FloatingActionButton, LoadingSkeleton, Screen } from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { useLocale } from "../../../../src/i18n/locale-context";
import { useFocusRefetch } from "../../../../src/hooks/use-focus-refetch";
import type { AnnouncementsResponse } from "../../../../src/types/api";

export default function AdminDuyurularIndex() {
  const router = useRouter();
  const { t: tr } = useLocale();
  const res = useApiGet<AnnouncementsResponse>("/api/v1/announcements/manage");
  useFocusRefetch(res.refresh);
  const announcements = res.status === "success" ? [...res.data.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  return (
    <Screen
      floatingAction={<FloatingActionButton icon="add" accessibilityLabel={tr("adm.anncNew")} onPress={() => router.push("/(admin)/islemler/duyurular/yeni")} />}
    >
      <AppHeader title={tr("adm.anncManageTitle")} showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : announcements.length === 0 ? (
        <EmptyState icon="megaphone-outline" title={tr("adm.anncEmpty")} actionLabel={tr("adm.anncNew")} onAction={() => router.push("/(admin)/islemler/duyurular/yeni")} />
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
