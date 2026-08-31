import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatusBadge,
  TextField,
} from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkResponse } from "../../../src/types/api";

type HomeworkSubmission = {
  id: string;
  homeworkId: string;
  note?: string;
  fileName?: string;
  fileMimeType?: string;
  submittedAt: string;
  teacherFeedback?: string;
  reviewedAt?: string;
};
type SubmissionsResponse = { submissions: HomeworkSubmission[] };

export default function OdevDetay() {
  const t = useTheme();
  const { homeworkId } = useLocalSearchParams<{ homeworkId: string }>();
  const homeworkRes = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  const submissionsRes = useApiGet<SubmissionsResponse>(`/api/v1/homework/${homeworkId}/submissions`);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const homework = useMemo(
    () => (homeworkRes.status === "success" ? homeworkRes.data.homework.find((h) => h.id === homeworkId) : undefined),
    [homeworkRes, homeworkId]
  );
  const latestSubmission = useMemo(() => {
    if (submissionsRes.status !== "success" || submissionsRes.data.submissions.length === 0) return undefined;
    return [...submissionsRes.data.submissions].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  }, [submissionsRes]);

  async function onReview() {
    if (!latestSubmission || feedback.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const res = await apiPost(`/api/v1/homework-submissions/${latestSubmission.id}/review`, {
      teacherFeedback: feedback.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Geri bildirim gönderilemedi.");
      return;
    }
    setFeedback("");
    submissionsRes.refresh();
  }

  if (homeworkRes.status === "loading" || submissionsRes.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ödev" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (homeworkRes.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ödev" showBack showNotifications={false} />
        <ErrorState message={homeworkRes.message} onRetry={homeworkRes.refresh} />
      </Screen>
    );
  }
  if (!homework) {
    return (
      <Screen>
        <AppHeader title="Ödev" showBack showNotifications={false} />
        <EmptyState icon="book-outline" title="Ödev bulunamadı" />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={submissionsRes.refresh} refreshing={false}>
      <AppHeader title={homework.title} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1 }}>
            {homework.studentName ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 4 }]}>{homework.studentName}</Text>
            ) : null}
            {homework.description ? <Text style={[t.typography.body, { color: t.colors.text }]}>{homework.description}</Text> : null}
          </View>
          {homework.status ? (
            <StatusBadge
              label={homework.status === "REVIEWED" ? "İncelendi" : homework.status === "SUBMITTED" ? "Teslim edildi" : "Bekliyor"}
              tone={homework.status === "REVIEWED" ? "success" : homework.status === "SUBMITTED" ? "info" : "warning"}
            />
          ) : null}
        </View>
        {homework.dueDate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
            <Icon name="calendar-outline" size={14} color={t.colors.textMuted} />
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{relativeDayLabel(new Date(homework.dueDate))}</Text>
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Öğrenci teslimi" />
      {!latestSubmission ? (
        <EmptyState icon="time-outline" title="Öğrenci henüz teslim etmedi" />
      ) : (
        <>
          <Card>
            <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(latestSubmission.submittedAt))}</Text>
            {latestSubmission.note ? (
              <Text style={[t.typography.body, { color: t.colors.text, marginTop: 6 }]}>{latestSubmission.note}</Text>
            ) : null}
            {latestSubmission.fileName ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                <Icon name="document-attach-outline" size={16} color={t.colors.textMuted} />
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]} numberOfLines={1}>
                  {latestSubmission.fileName}
                </Text>
              </View>
            ) : null}
            {latestSubmission.teacherFeedback ? (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
                <Text style={[t.typography.label, { color: t.colors.textMuted }]}>Geri bildiriminiz</Text>
                <Text style={[t.typography.body, { color: t.colors.text, marginTop: 4 }]}>{latestSubmission.teacherFeedback}</Text>
              </View>
            ) : null}
          </Card>

          {!latestSubmission.reviewedAt ? (
            <Card>
              <TextField
                label="Geri bildirim yaz"
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Öğrenciye geri bildiriminizi yazın"
                multiline
                numberOfLines={3}
              />
              {error ? <Text style={{ color: t.colors.danger, marginTop: 8 }}>{error}</Text> : null}
              <Button
                label="Geri bildirimi gönder"
                onPress={onReview}
                disabled={feedback.trim().length === 0 || busy}
                loading={busy}
                style={{ marginTop: 12 }}
              />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
