import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../../../../src/components/ui";
import { useApiGet } from "../../../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../../../src/lib/date";
import { useTheme } from "../../../../../src/theme/theme-context";
import type { TeacherFeedbackReviewResponse } from "../../../../../src/types/api";

const STATUS_LABEL: Record<string, string> = { pending: "İncelenmedi", reviewed: "İncelendi", actioned: "İşlem yapıldı", archived: "Arşivlendi" };
const NEXT_STATUS: Record<string, string | null> = { pending: "reviewed", reviewed: "actioned", actioned: "archived", archived: null };

export default function TeacherFeedbackReview() {
  const t = useTheme();
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
      <AppHeader title="Geri bildirimler" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.feedback.length === 0 ? (
        <EmptyState icon="star-outline" title="Henüz geri bildirim yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.feedback.map((f) => {
            const avg = Object.values(f.scores).reduce((s, v) => s + v, 0) / Object.values(f.scores).length;
            const next = NEXT_STATUS[f.status];
            return (
              <Card key={f.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>Ortalama {avg.toFixed(1)}/5</Text>
                  <StatusBadge label={STATUS_LABEL[f.status] ?? f.status} tone={f.status === "pending" ? "warning" : "neutral"} />
                </View>
                <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>
                  {f.submitterRole === "PARENT" ? "Veli" : "Öğrenci"} · {relativeDayLabel(new Date(f.createdAt))}
                </Text>
                {f.comment ? <Text style={[t.typography.body, { color: t.colors.text, marginTop: 8 }]}>{f.comment}</Text> : null}
                {next ? (
                  <Button
                    label={`${STATUS_LABEL[next]} olarak işaretle`}
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
