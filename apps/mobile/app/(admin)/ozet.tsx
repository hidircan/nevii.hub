import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import {
  ActionCard,
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "../../src/components/ui";
import { useApiGet } from "../../src/hooks/use-api";
import { useTheme } from "../../src/theme/theme-context";
import type { AdminDashboardSummary } from "../../src/types/api";

export default function AdminOzet() {
  const t = useTheme();
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <ActionCard icon="calendar" label="Ders programı" onPress={() => router.push("/(admin)/program")} />
            <ActionCard icon="checkmark-done" label="Yoklama" onPress={() => router.push("/(admin)/program")} />
            <ActionCard icon="megaphone" label="Duyuru oluştur" onPress={() => router.push("/(admin)/islemler/duyurular/yeni")} />
            <ActionCard icon="person-add" label="Öğrenci ekle" onPress={() => router.push("/(admin)/kisiler")} />
            <ActionCard icon="add-circle" label="İş oluştur" onPress={() => router.push("/(admin)/islemler/is-takip")} />
          </View>

          <SectionHeader title="Dikkat gerektirenler" />
          {res.data.attentionItems.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title="Her şey yolunda" description="Şu an dikkat gerektiren bir madde yok." />
          ) : (
            <View style={{ gap: 10 }}>
              {res.data.attentionItems.map((item) => (
                <Card key={item.id}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Icon name="alert-circle" size={18} color={t.colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{item.label}</Text>
                      {item.detail ? <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{item.detail}</Text> : null}
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}

          <SectionHeader title="Öğretmen performansı" actionLabel="Tümü" onAction={() => router.push("/(admin)/kisiler")} />
          {res.data.topTeachers.length === 0 ? (
            <EmptyState icon="school-outline" title="Henüz veri yok" />
          ) : (
            <Card>
              {res.data.topTeachers.map((teacher, i) => (
                <View
                  key={teacher.teacherId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: t.colors.divider,
                  }}
                >
                  <Text style={[t.typography.body, { color: t.colors.text }]}>{teacher.teacherName}</Text>
                  {teacher.insufficientData ? (
                    <StatusBadge label="Yetersiz veri" tone="neutral" />
                  ) : (
                    <StatusBadge label={`${teacher.score}/100`} tone={teacher.score! >= 80 ? "success" : teacher.score! >= 60 ? "warning" : "danger"} />
                  )}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
