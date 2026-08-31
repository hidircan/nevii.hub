import { Text, View } from "react-native";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader, StatCard } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkReportResponse } from "../../../src/types/api";

export default function OdevRaporu() {
  const t = useTheme();
  const res = useApiGet<HomeworkReportResponse>("/api/v1/homework/report");

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Ödev raporu" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <StatCard icon="document-text-outline" label="Toplam ödev" value={res.data.totalCount} tone="primary" />
            <StatCard icon="checkmark-circle-outline" label="Teslim edildi" value={res.data.submittedCount} tone="success" />
            <StatCard icon="time-outline" label="Bekliyor" value={res.data.pendingCount} tone="info" />
            <StatCard icon="alert-circle-outline" label="Eksik (süresi geçti)" value={res.data.overdueCount} tone="danger" />
          </View>

          <Card>
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
              {res.data.submittedCount} teslimden {res.data.reviewedCount} tanesi öğretmen tarafından değerlendirildi.
            </Text>
          </Card>

          <SectionHeader title="Öğretmen bazında dağılım" />
          {res.data.byTeacher.length === 0 ? (
            <EmptyState icon="document-text-outline" title="Henüz ödev verilmemiş" />
          ) : (
            <View style={{ gap: 8 }}>
              {res.data.byTeacher.map((row) => (
                <Card key={row.teacherId}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{row.teacherName}</Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
                      {row.submittedCount}/{row.assignedCount}
                      {row.assignedCount > 0 ? ` (%${Math.round((row.submittedCount / row.assignedCount) * 100)})` : ""}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
