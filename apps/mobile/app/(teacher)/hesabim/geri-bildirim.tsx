import { Text, View } from "react-native";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeacherFeedbackSummary } from "../../../src/types/api";

const CRITERIA_LABEL: Record<string, string> = {
  clarity: "Açıklık",
  communication: "İletişim",
  effectiveness: "Etkililik",
  motivation: "Motivasyon",
  punctuality: "Dakiklik",
};

export default function TeacherGeriBildirim() {
  const t = useTheme();
  const res = useApiGet<TeacherFeedbackSummary>("/api/v1/teacher-feedback/summary");

  return (
    <Screen>
      <AppHeader title="Geri bildirim özetim" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : !res.data.eligible ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="Yeterli veri yok"
          description={`Anonimliği korumak için en az birkaç yanıt gerekir. Şu an ${res.data.responseCount} yanıt var.`}
        />
      ) : (
        <>
          <Card>
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{res.data.responseCount} yanıt üzerinden</Text>
          </Card>

          <SectionHeader title="Kriter ortalamaları" />
          <Card>
            <View style={{ gap: 10 }}>
              {Object.entries(res.data.criteriaAverages ?? {}).map(([key, value]) => (
                <View key={key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[t.typography.body, { color: t.colors.text }]}>{CRITERIA_LABEL[key] ?? key}</Text>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>{value.toFixed(1)}/5</Text>
                </View>
              ))}
            </View>
          </Card>

          <SectionHeader title="Devam etme eğilimi" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.success }]}>{res.data.continueDistribution?.yes ?? 0}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Evet</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.warning }]}>{res.data.continueDistribution?.unsure ?? 0}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Kararsız</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.danger }]}>{res.data.continueDistribution?.no ?? 0}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Hayır</Text>
            </Card>
          </View>

          {res.data.sharedComments.length > 0 ? (
            <>
              <SectionHeader title="Paylaşılan yorumlar" />
              <View style={{ gap: 10 }}>
                {res.data.sharedComments.map((c, i) => (
                  <Card key={i}>
                    <Text style={[t.typography.body, { color: t.colors.text }]}>{c}</Text>
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
