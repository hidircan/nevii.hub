import { useRouter } from "expo-router";
import { View } from "react-native";
import {
  AppHeader,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../../src/components/ui";
import { useApiGet } from "../../src/hooks/use-api";
import type { AdminDashboardSummary } from "../../src/types/api";

export default function AdminOzet() {
  const router = useRouter();
  const res = useApiGet<AdminDashboardSummary>("/api/v1/dashboard/summary");

  // Jenerik "Hoş geldiniz" selamlaması yerine marka + gerçek bugünkü özet —
  // diğer portallardaki (öğretmen/veli/öğrenci) aynı desen: dolgu cümle yok,
  // veri henüz yüklenmediyse alt başlık gösterilmez (bkz. AppHeader).
  const headerContext =
    res.status === "success"
      ? res.data.upcomingLessonCount > 0
        ? `Bugün ${res.data.upcomingLessonCount} ders · ${res.data.pendingAttendanceCount} bekleyen yoklama`
        : "Bugün için planlanmış ders yok"
      : undefined;

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="NeviiHub" subtitle={headerContext} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : (
        <>
          <SectionHeader title="Bugün" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatCard icon="calendar-outline" label="Bugün kalan ders" value={res.data.upcomingLessonCount} tone="primary" onPress={() => router.push("/(admin)/program")} />
            <StatCard icon="clipboard-outline" label="Bekleyen yoklama" value={res.data.pendingAttendanceCount} tone="warning" />
            <StatCard icon="alert-circle-outline" label="Gecikmiş görev" value={res.data.overdueTaskCount} tone="danger" onPress={() => router.push("/(admin)/islemler/is-takip")} />
            <StatCard icon="cash-outline" label="Takip gereken tahsilat" value={res.data.followUpNeededCount} tone="info" />
          </View>

          <SectionHeader title="Hızlı işlemler" />
          <ListGroup>
            <ListRow icon="calendar-outline" title="Ders programı" onPress={() => router.push("/(admin)/program")} />
            <ListRow icon="checkmark-done-outline" title="Yoklama" onPress={() => router.push("/(admin)/program")} />
            <ListRow icon="megaphone-outline" title="Duyuru oluştur" onPress={() => router.push("/(admin)/islemler/duyurular/yeni")} />
            <ListRow icon="person-add-outline" title="Öğrenci ekle" onPress={() => router.push("/(admin)/kisiler")} />
            <ListRow icon="add-circle-outline" title="İş oluştur" onPress={() => router.push("/(admin)/islemler/is-takip")} />
          </ListGroup>

          <SectionHeader title="Dikkat gerektirenler" />
          {res.data.attentionItems.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title="Her şey yolunda" description="Şu an dikkat gerektiren bir madde yok." />
          ) : (
            <ListGroup>
              {res.data.attentionItems.map((item) => (
                <ListRow key={item.id} icon="alert-circle-outline" title={item.label} subtitle={item.detail ?? undefined} />
              ))}
            </ListGroup>
          )}

          <SectionHeader title="Öğretmen performansı" actionLabel="Tümü" onAction={() => router.push("/(admin)/kisiler")} />
          {res.data.topTeachers.length === 0 ? (
            <EmptyState icon="school-outline" title="Henüz veri yok" />
          ) : (
            <ListGroup>
              {res.data.topTeachers.map((teacher) => (
                <View key={teacher.teacherId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ListRow icon="school-outline" title={teacher.teacherName} />
                  </View>
                  {teacher.insufficientData ? (
                    <StatusBadge label="Yetersiz veri" tone="neutral" />
                  ) : (
                    <StatusBadge label={`${teacher.score}/100`} tone={teacher.score! >= 80 ? "success" : teacher.score! >= 60 ? "warning" : "danger"} />
                  )}
                </View>
              ))}
            </ListGroup>
          )}
        </>
      )}
    </Screen>
  );
}
