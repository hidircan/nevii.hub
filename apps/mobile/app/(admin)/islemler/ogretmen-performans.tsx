import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { AppHeader, Avatar, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeachersResponse } from "../../../src/types/api";

export default function OgretmenPerformans() {
  const t = useTheme();
  const router = useRouter();
  const res = useApiGet<TeachersResponse>("/api/v1/teachers");

  const ranked = res.status === "success" ? [...res.data.teachers].sort((a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1)) : [];

  return (
    <Screen>
      <AppHeader title="Öğretmen performansı" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={5} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : ranked.length === 0 ? (
        <EmptyState icon="school-outline" title="Öğretmen bulunamadı" />
      ) : (
        <View style={{ gap: 10 }}>
          {ranked.map((tt, i) => (
            <Card key={tt.id} onPress={() => router.push(`/(admin)/kisiler/ogretmen/${tt.id}`)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={[t.typography.sectionTitle, { color: t.colors.textFaint, width: 24 }]}>{i + 1}</Text>
                <Avatar name={tt.name} />
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{tt.name}</Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{tt.activeStudentCount} aktif öğrenci</Text>
                </View>
                {tt.performanceLabel === "insufficient_data" ? (
                  <StatusBadge label="Yetersiz veri" tone="neutral" />
                ) : (
                  <StatusBadge label={`${tt.performanceScore}/100`} tone={(tt.performanceScore ?? 0) >= 80 ? "success" : (tt.performanceScore ?? 0) >= 60 ? "warning" : "danger"} />
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
