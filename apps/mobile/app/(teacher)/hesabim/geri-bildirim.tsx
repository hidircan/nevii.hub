import { View } from "react-native";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeacherFeedbackSummary } from "../../../src/types/api";

const CRITERIA_KEY: Record<string, string> = {
  clarity: "fbSum.critClarity",
  communication: "fbSum.critCommunication",
  effectiveness: "fbSum.critEffectiveness",
  motivation: "fbSum.critMotivation",
  punctuality: "fbSum.critPunctuality",
};

export default function TeacherGeriBildirim() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const res = useApiGet<TeacherFeedbackSummary>("/api/v1/teacher-feedback/summary");

  return (
    <Screen>
      <AppHeader title={tr("fbSum.title")} showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : !res.data.eligible ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title={tr("fbSum.notEnough")}
          description={tr("fbSum.needMore", { n: res.data.responseCount })}
        />
      ) : (
        <>
          <Card>
            <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("fbSum.basedOn", { n: res.data.responseCount })}</AppText>
          </Card>

          <SectionHeader title={tr("fbSum.criteriaTitle")} />
          <Card>
            <View style={{ gap: 10 }}>
              {Object.entries(res.data.criteriaAverages ?? {}).map(([key, value]) => (
                <View key={key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <AppText style={[t.typography.body, { color: t.colors.text }]}>{CRITERIA_KEY[key] ? tr(CRITERIA_KEY[key]) : key}</AppText>
                  <AppText style={[t.typography.bodyStrong, { color: t.colors.primary }]}>{value.toFixed(1)}/5</AppText>
                </View>
              ))}
            </View>
          </Card>

          <SectionHeader title={tr("fbSum.continueTitle")} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <AppText style={[t.typography.screenTitle, { color: t.colors.success }]}>{res.data.continueDistribution?.yes ?? 0}</AppText>
              <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("fbSum.yes")}</AppText>
            </Card>
            <Card style={{ flex: 1 }}>
              <AppText style={[t.typography.screenTitle, { color: t.colors.warning }]}>{res.data.continueDistribution?.unsure ?? 0}</AppText>
              <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("fbSum.unsure")}</AppText>
            </Card>
            <Card style={{ flex: 1 }}>
              <AppText style={[t.typography.screenTitle, { color: t.colors.danger }]}>{res.data.continueDistribution?.no ?? 0}</AppText>
              <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("fbSum.no")}</AppText>
            </Card>
          </View>

          {res.data.sharedComments.length > 0 ? (
            <>
              <SectionHeader title={tr("fbSum.sharedTitle")} />
              <View style={{ gap: 10 }}>
                {res.data.sharedComments.map((c, i) => (
                  <Card key={i}>
                    <AppText style={[t.typography.body, { color: t.colors.text }]}>{c}</AppText>
                  </Card>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
