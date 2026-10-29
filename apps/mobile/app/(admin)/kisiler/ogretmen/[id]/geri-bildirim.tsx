import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { apiPost } from "../../../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge, AppText } from "../../../../../src/components/ui";
import { useApiGet } from "../../../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../../../src/lib/date";
import { useLocale } from "../../../../../src/i18n/locale-context";
import { useTheme } from "../../../../../src/theme/theme-context";
import type { TeacherFeedbackReviewResponse } from "../../../../../src/types/api";

const STATUS_KEY: Record<string, string> = { pending: "adm.tchFbStPending", reviewed: "adm.tchFbStReviewed", actioned: "adm.tchFbStActioned", archived: "adm.tchFbStArchived" };
const NEXT_STATUS: Record<string, string | null> = { pending: "reviewed", reviewed: "actioned", actioned: "archived", archived: null };

export default function TeacherFeedbackReview() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const res = useApiGet<TeacherFeedbackReviewResponse>(`/api/v1/teacher-feedback/review?teacherId=${id}`);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function advance(feedbackId: string, status: string) {
    setBusyId(feedbackId);
    await apiPost("/api/v1/teacher-feedback/status", { feedbackId, status });
    setBusyId(null);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("adm.tchFbTitle")} showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.feedback.length === 0 ? (
        <EmptyState icon="star-outline" title={tr("adm.tchFbEmpty")} />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.feedback.map((f) => {
            const avg = Object.values(f.scores).reduce((s, v) => s + v, 0) / Object.values(f.scores).length;
            const next = NEXT_STATUS[f.status];
            return (
              <Card key={f.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{tr("adm.tchFbAvg", { v: avg.toFixed(1) })}</AppText>
                  <StatusBadge label={STATUS_KEY[f.status] ? tr(STATUS_KEY[f.status]) : f.status} tone={f.status === "pending" ? "warning" : "neutral"} />
                </View>
                <AppText style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>
                  {f.submitterRole === "PARENT" ? tr("adm.stuRoleGuardian") : tr("adm.stuRoleStudent")} · {relativeDayLabel(new Date(f.createdAt))}
                </AppText>
                {f.comment ? <AppText style={[t.typography.body, { color: t.colors.text, marginTop: 8 }]}>{f.comment}</AppText> : null}
                {next ? (
                  <Button
                    label={tr("adm.tchFbMarkAs", { status: STATUS_KEY[next] ? tr(STATUS_KEY[next]) : next })}
                    size="sm"
                    variant="secondary"
                    loading={busyId === f.id}
                    onPress={() => advance(f.id, next)}
                    style={{ marginTop: 10 }}
                    fullWidth={false}
                  />
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
