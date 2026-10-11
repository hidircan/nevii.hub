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
import { useLocale } from "../../src/i18n/locale-context";
import type { AdminDashboardSummary } from "../../src/types/api";

export default function AdminOzet() {
  const router = useRouter();
  const { t: tr } = useLocale();
  const res = useApiGet<AdminDashboardSummary>("/api/v1/dashboard/summary");

  // Jenerik "Hoş geldiniz" selamlaması yerine marka + gerçek bugünkü özet —
  // diğer portallardaki (öğretmen/veli/öğrenci) aynı desen: dolgu cümle yok,
  // veri henüz yüklenmediyse alt başlık gösterilmez (bkz. AppHeader).
  const headerContext =
    res.status === "success"
      ? res.data.upcomingLessonCount > 0
        ? tr("adm.dashHeader", { l: res.data.upcomingLessonCount, p: res.data.pendingAttendanceCount })
        : tr("adm.dashHeaderEmpty")
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
          <SectionHeader title={tr("adm.dashToday")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatCard icon="calendar-outline" label={tr("adm.dashRemaining")} value={res.data.upcomingLessonCount} tone="primary" onPress={() => router.push("/(admin)/program")} />
            <StatCard icon="clipboard-outline" label={tr("adm.dashPendingAtt")} value={res.data.pendingAttendanceCount} tone="warning" />
            <StatCard icon="alert-circle-outline" label={tr("adm.dashOverdue")} value={res.data.overdueTaskCount} tone="danger" onPress={() => router.push("/(admin)/islemler/is-takip")} />
            <StatCard icon="cash-outline" label={tr("adm.dashFollowUp")} value={res.data.followUpNeededCount} tone="info" />
          </View>

          <SectionHeader title={tr("adm.dashQuick")} />
          <ListGroup>
            <ListRow icon="calendar-outline" title={tr("adm.dashSchedule")} onPress={() => router.push("/(admin)/program")} />
            <ListRow icon="checkmark-done-outline" title={tr("adm.dashAttendance")} onPress={() => router.push("/(admin)/program")} />
            <ListRow icon="megaphone-outline" title={tr("adm.dashNewAnnc")} onPress={() => router.push("/(admin)/islemler/duyurular/yeni")} />
            <ListRow icon="person-add-outline" title={tr("adm.dashAddStudent")} onPress={() => router.push("/(admin)/kisiler")} />
            <ListRow icon="add-circle-outline" title={tr("adm.dashNewTask")} onPress={() => router.push("/(admin)/islemler/is-takip")} />
          </ListGroup>

          <SectionHeader title={tr("adm.dashAttention")} />
          {res.data.attentionItems.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title={tr("adm.dashAllOk")} description={tr("adm.dashAllOkDesc")} />
          ) : (
            <ListGroup>
              {res.data.attentionItems.map((item) => (
                <ListRow key={item.id} icon="alert-circle-outline" title={item.label} subtitle={item.detail ?? undefined} />
              ))}
            </ListGroup>
          )}

          <SectionHeader title={tr("adm.dashPerf")} actionLabel={tr("adm.dashAll")} onAction={() => router.push("/(admin)/kisiler")} />
          {res.data.topTeachers.length === 0 ? (
            <EmptyState icon="school-outline" title={tr("adm.dashNoData")} />
          ) : (
            <ListGroup>
              {res.data.topTeachers.map((teacher) => (
                <View key={teacher.teacherId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ListRow icon="school-outline" title={teacher.teacherName} />
                  </View>
                  {teacher.insufficientData ? (
                    <StatusBadge label={tr("adm.dashInsufficient")} tone="neutral" />
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
