import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { AppHeader, Avatar, Card, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../../../../src/components/ui";
import { useApiGet } from "../../../../../src/hooks/use-api";
import { useNow } from "../../../../../src/hooks/use-now";
import { format, isPast } from "../../../../../src/lib/date";
import { useLocale } from "../../../../../src/i18n/locale-context";
import { useTheme } from "../../../../../src/theme/theme-context";
import type { ScheduleResponse, TasksResponse, TeacherPerformanceV2Response, TeachersResponse } from "../../../../../src/types/api";

const now = new Date();
const perfPeriodStart = format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30), "yyyy-MM-dd");
const perfPeriodEnd = format(now, "yyyy-MM-dd");
// Yaklaşan-ders sayacı yalnız geleceğe bakar — geçmiş taşınmaz (oturumda sabit).
const upcomingFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

export default function TeacherDetailScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const now = useNow();
  const { id } = useLocalSearchParams<{ id: string }>();

  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers");
  const schedule = useApiGet<ScheduleResponse>(
    `/api/v1/teachers/${id}/schedule?from=${encodeURIComponent(upcomingFrom)}&limit=2000`
  );
  const tasks = useApiGet<TasksResponse>(`/api/v1/tasks?assigneeId=${id}`);
  const perfV2 = useApiGet<TeacherPerformanceV2Response>(
    `/api/v1/teachers/${id}/performance-v2?periodStart=${perfPeriodStart}&periodEnd=${perfPeriodEnd}`
  );

  const teacher = teachers.status === "success" ? teachers.data.teachers.find((tt) => tt.id === id) : undefined;

  if (teachers.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("adm.tchTitle")} showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (teachers.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("adm.tchTitle")} showBack showNotifications={false} />
        <ErrorState message={teachers.message} onRetry={teachers.refresh} />
      </Screen>
    );
  }

  const upcomingCount = schedule.status === "success" ? schedule.data.lessons.filter((l) => !isPast(l.startAt, now)).length : null;
  const openTaskCount = tasks.status === "success" ? tasks.data.tasks.filter((tk) => tk.status !== "COMPLETED" && tk.status !== "ARCHIVED").length : null;

  return (
    <Screen>
      <AppHeader title={teacher?.name ?? tr("adm.tchTitle")} showBack showNotifications={false} />

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

      <SectionHeader title={tr("adm.tchPerf")} />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[t.typography.body, { color: t.colors.text }]}>{tr("adm.tchPerfDesc")}</Text>
          {teacher?.performanceLabel === "insufficient_data" ? (
            <StatusBadge label={tr("adm.dashInsufficient")} tone="neutral" />
          ) : (
            <StatusBadge
              label={`${teacher?.performanceScore}/100`}
              tone={(teacher?.performanceScore ?? 0) >= 80 ? "success" : (teacher?.performanceScore ?? 0) >= 60 ? "warning" : "danger"}
            />
          )}
        </View>
      </Card>

      <SectionHeader title={tr("adm.tchV2")} />
      <Pressable onPress={() => router.push(`/(admin)/kisiler/ogretmen/${id}/performans` as never)}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[t.typography.body, { color: t.colors.text }]}>{tr("adm.tchV2Desc")}</Text>
            {perfV2.status === "success" ? (
              perfV2.data.score === null ? (
                <StatusBadge label={tr("adm.dashInsufficient")} tone="neutral" />
              ) : (
                <StatusBadge
                  label={`${perfV2.data.score}/100`}
                  tone={perfV2.data.score >= 80 ? "success" : perfV2.data.score >= 60 ? "warning" : "danger"}
                />
              )
            ) : perfV2.status === "error" ? (
              <StatusBadge label={tr("adm.tchLoadFail")} tone="danger" />
            ) : (
              <StatusBadge label={tr("adm.stuLoading")} tone="neutral" />
            )}
          </View>
          <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 10 }]}>
            {tr("adm.tchDetailsLink")}
          </Text>
        </Card>
      </Pressable>

      <SectionHeader title={tr("adm.tchSched")} />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>
          {upcomingCount === null ? tr("adm.stuLoading") : tr("adm.stuUpcoming", { n: upcomingCount })}
        </Text>
        <Text style={[t.typography.body, { color: t.colors.text, marginTop: 6 }]}>{tr("adm.tPerfActive", { n: teacher?.activeStudentCount ?? 0 })}</Text>
        <Text
          style={[t.typography.caption, { color: t.colors.primary, marginTop: 10 }]}
          onPress={() => router.push("/(admin)/program")}
        >
          {tr("adm.tchViewSched")}
        </Text>
      </Card>

      <SectionHeader title={tr("adm.tchTasks")} />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>
          {openTaskCount === null ? tr("adm.stuLoading") : tr("adm.tchOpenTasks", { n: openTaskCount })}
        </Text>
      </Card>

      <SectionHeader title={tr("adm.tchOther")} />
      <Card>
        {[
          { key: "musaitlik", label: tr("adm.tchLinkAvail"), icon: "time-outline" as const },
          { key: "geri-bildirim", label: tr("adm.tchLinkFb"), icon: "star-outline" as const },
          { key: "hakedis", label: tr("adm.tchLinkPay"), icon: "cash-outline" as const },
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
