import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge, TextField, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
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
  const { t: tr } = useLocale();
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
      setError(res.error.message || tr("teachHw.feedbackFailed"));
      return;
    }
    setFeedback("");
    submissionsRes.refresh();
  }

  if (homeworkRes.status === "loading" || submissionsRes.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("hwList.single")} showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (homeworkRes.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("hwList.single")} showBack showNotifications={false} />
        <ErrorState message={homeworkRes.message} onRetry={homeworkRes.refresh} />
      </Screen>
    );
  }
  if (!homework) {
    return (
      <Screen>
        <AppHeader title={tr("hwList.single")} showBack showNotifications={false} />
        <EmptyState icon="book-outline" title={tr("teachHw.detailMissing")} />
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
              <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 4 }]}>{homework.studentName}</AppText>
            ) : null}
            {homework.description ? <AppText style={[t.typography.body, { color: t.colors.text }]}>{homework.description}</AppText> : null}
          </View>
          {homework.status ? (
            <StatusBadge
              label={homework.status === "REVIEWED" ? tr("hw.reviewed") : homework.status === "SUBMITTED" ? tr("hw.submitted") : tr("hw.pending")}
              tone={homework.status === "REVIEWED" ? "success" : homework.status === "SUBMITTED" ? "info" : "warning"}
            />
          ) : null}
        </View>
        {homework.dueDate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
            <Icon name="calendar-outline" size={14} color={t.colors.textMuted} />
            <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{relativeDayLabel(new Date(homework.dueDate))}</AppText>
          </View>
        ) : null}
      </Card>

      <SectionHeader title={tr("teachHw.submissionTitle")} />
      {!latestSubmission ? (
        <EmptyState icon="time-outline" title={tr("teachHw.noSubmission")} />
      ) : (
        <>
          <Card>
            <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(latestSubmission.submittedAt))}</AppText>
            {latestSubmission.note ? (
              <AppText style={[t.typography.body, { color: t.colors.text, marginTop: 6 }]}>{latestSubmission.note}</AppText>
            ) : null}
            {latestSubmission.fileName ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                <Icon name="document-attach-outline" size={16} color={t.colors.textMuted} />
                <AppText style={[t.typography.caption, { color: t.colors.textMuted }]} numberOfLines={1}>
                  {latestSubmission.fileName}
                </AppText>
              </View>
            ) : null}
            {latestSubmission.teacherFeedback ? (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
                <AppText style={[t.typography.label, { color: t.colors.textMuted }]}>{tr("teachHw.feedbackYours")}</AppText>
                <AppText style={[t.typography.body, { color: t.colors.text, marginTop: 4 }]}>{latestSubmission.teacherFeedback}</AppText>
              </View>
            ) : null}
          </Card>

          {!latestSubmission.reviewedAt ? (
            <Card>
              <TextField
                label={tr("teachHw.feedbackWrite")}
                value={feedback}
                onChangeText={setFeedback}
                placeholder={tr("teachHw.feedbackPlaceholder")}
                multiline
                numberOfLines={3}
              />
              {error ? <AppText style={[t.typography.caption, { color: t.colors.danger, marginTop: 8 }]}>{error}</AppText> : null}
              <Button
                label={tr("teachHw.feedbackSend")}
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
