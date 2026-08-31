import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { AppHeader, Avatar, Card, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../../../../src/components/ui";
import { useApiGet } from "../../../../../src/hooks/use-api";
import { format } from "../../../../../src/lib/date";
import { useTheme } from "../../../../../src/theme/theme-context";
import type { ScheduleResponse, TasksResponse, TeacherPerformanceV2Response, TeachersResponse } from "../../../../../src/types/api";

const now = new Date();
const perfPeriodStart = format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30), "yyyy-MM-dd");
const perfPeriodEnd = format(now, "yyyy-MM-dd");

export default function TeacherDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers");
  const schedule = useApiGet<ScheduleResponse>(`/api/v1/teachers/${id}/schedule`);
  const tasks = useApiGet<TasksResponse>(`/api/v1/tasks?assigneeId=${id}`);
  const perfV2 = useApiGet<TeacherPerformanceV2Response>(
    `/api/v1/teachers/${id}/performance-v2?periodStart=${perfPeriodStart}&periodEnd=${perfPeriodEnd}`
  );

  const teacher = teachers.status === "success" ? teachers.data.teachers.find((tt) => tt.id === id) : undefined;

  if (teachers.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Öğretmen" showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (teachers.status === "error") {
    return (
      <Screen>
        <AppHeader title="Öğretmen" showBack showNotifications={false} />
        <ErrorState message={teachers.message} onRetry={teachers.refresh} />
      </Screen>
    );
  }

  const upcomingCount = schedule.status === "success" ? schedule.data.lessons.filter((l) => new Date(l.startAt).getTime() >= Date.now()).length : null;
  const openTaskCount = tasks.status === "success" ? tasks.data.tasks.filter((tk) => tk.status !== "COMPLETED" && tk.status !== "ARCHIVED").length : null;

  return (
    <Screen>
      <AppHeader title={teacher?.name ?? "Öğretmen"} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={teacher?.name ?? "?"} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{teacher?.name}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{teacher?.instruments.join(", ")}</Text>
          </View>
        </View>
        <View style={{ gap: 6, marginTop: 12 }}>
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{teacher?.phone}</Text>
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{teacher?.email}</Text>
        </View>
      </Card>

      <SectionHeader title="Performans" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[t.typography.body, { color: t.colors.text }]}>Yoklama bazlı performans skoru</Text>
          {teacher?.performanceLabel === "insufficient_data" ? (
            <StatusBadge label="Yetersiz veri" tone="neutral" />
          ) : (
            <StatusBadge
              label={`${teacher?.performanceScore}/100`}
              tone={(teacher?.performanceScore ?? 0) >= 80 ? "success" : (teacher?.performanceScore ?? 0) >= 60 ? "warning" : "danger"}
            />
          )}
        </View>
      </Card>

      <SectionHeader title="Detaylı performans (v2)" />
      <Pressable onPress={() => router.push(`/(admin)/kisiler/ogretmen/${id}/performans` as never)}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[t.typography.body, { color: t.colors.text }]}>4 bileşenli genişletilmiş skor</Text>
            {perfV2.status === "success" ? (
              perfV2.data.score === null ? (
                <StatusBadge label="Yetersiz veri" tone="neutral" />
              ) : (
                <StatusBadge
                  label={`${perfV2.data.score}/100`}
                  tone={perfV2.data.score >= 80 ? "success" : perfV2.data.score >= 60 ? "warning" : "danger"}
                />
              )
            ) : perfV2.status === "error" ? (
              <StatusBadge label="Yüklenemedi" tone="danger" />
            ) : (
              <StatusBadge label="Yükleniyor…" tone="neutral" />
            )}
          </View>
          <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 10 }]}>
            Yoklama, geri bildirim, iş takip, ödev detayları →
          </Text>
        </Card>
      </Pressable>

      <SectionHeader title="Program özeti" />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>
          {upcomingCount === null ? "Yükleniyor…" : `${upcomingCount} yaklaşan ders`}
        </Text>
        <Text style={[t.typography.body, { color: t.colors.text, marginTop: 6 }]}>{teacher?.activeStudentCount} aktif öğrenci</Text>
        <Text
          style={[t.typography.caption, { color: t.colors.primary, marginTop: 10 }]}
          onPress={() => router.push("/(admin)/program")}
        >
          Programı görüntüle →
        </Text>
      </Card>

      <SectionHeader title="Görev metrikleri" />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>
          {openTaskCount === null ? "Yükleniyor…" : `${openTaskCount} açık görev`}
        </Text>
      </Card>

      <SectionHeader title="Diğer" />
      <Card>
        {[
          { key: "musaitlik", label: "Müsaitlik önerileri", icon: "time-outline" as const },
          { key: "geri-bildirim", label: "Veli/öğrenci geri bildirimleri", icon: "star-outline" as const },
          { key: "hakedis", label: "Hakediş", icon: "cash-outline" as const },
        ].map((link, i) => (
          <View key={link.key}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} /> : null}
            <Pressable
              onPress={() => router.push(`/(admin)/kisiler/ogretmen/${id}/${link.key}` as never)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, justifyContent: "space-between" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name={link.icon} size={16} color={t.colors.textMuted} />
                <Text style={[t.typography.body, { color: t.colors.text }]}>{link.label}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
            </Pressable>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
