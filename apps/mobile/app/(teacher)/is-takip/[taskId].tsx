import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge, TextField } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { TaskItem } from "../../../src/types/api";

type TaskDetailResponse = {
  task: TaskItem;
  checklist: Array<{ id: string; title: string; isCompleted: boolean }>;
  comments: Array<{ id: string; body: string; createdAt: string }>;
  activity: Array<{ id: string; summary: string; createdAt: string }>;
  attachments: Array<{ id: string; type: "FILE" | "LINK"; title: string; url?: string; fileName?: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  TODO: "Yapılacak",
  IN_PROGRESS: "Devam ediyor",
  BLOCKED: "Engellendi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
  ARCHIVED: "Arşivlendi",
};

export default function TaskDetailScreen() {
  const t = useTheme();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const res = useApiGet<TaskDetailResponse>(`/api/v1/tasks/${taskId}`);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  async function changeStatus(status: string) {
    setBusyStatus(status);
    await apiPost("/api/v1/tasks/" + taskId, { status });
    setBusyStatus(null);
    res.refresh();
  }

  async function onAddComment() {
    if (!commentBody.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    const submitRes = await apiPost(`/api/v1/tasks/${taskId}/comments`, { body: commentBody.trim() });
    setCommentBusy(false);
    if (!submitRes.ok) {
      setCommentError(submitRes.error.message || "Yorum eklenemedi.");
      return;
    }
    setCommentBody("");
    res.refresh();
  }

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Görev" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="Görev" showBack showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  const { task, checklist, activity, comments, attachments } = res.data;

  return (
    <Screen onRefresh={res.refresh} refreshing={false}>
      <AppHeader title={task.title} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: task.description ? 10 : 0 }}>
          <StatusBadge label={STATUS_LABEL[task.status] ?? task.status} tone={task.status === "COMPLETED" ? "success" : "neutral"} />
          {task.priority ? <StatusBadge label={task.priority} tone="warning" /> : null}
          {task.category ? <StatusBadge label={task.category} tone="info" /> : null}
        </View>
        {task.description ? <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{task.description}</Text> : null}
        {task.dueDate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
            <Icon name="calendar-outline" size={14} color={t.colors.textMuted} />
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{relativeDayLabel(new Date(task.dueDate))}</Text>
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Durum değiştir" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["TODO", "IN_PROGRESS", "COMPLETED"].map((s) => (
          <Button
            key={s}
            label={STATUS_LABEL[s]!}
            size="sm"
            variant={task.status === s ? "primary" : "secondary"}
            loading={busyStatus === s}
            onPress={() => changeStatus(s)}
          />
        ))}
      </View>

      {checklist.length > 0 ? (
        <>
          <SectionHeader title="Kontrol listesi" />
          <Card>
            {checklist.map((item, i) => (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.divider }}>
                <Icon name={item.isCompleted ? "checkbox" : "square-outline"} size={18} color={item.isCompleted ? t.colors.success : t.colors.textMuted} />
                <Text style={[t.typography.body, { color: t.colors.text, textDecorationLine: item.isCompleted ? "line-through" : "none" }]}>
                  {item.title}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {attachments.length > 0 ? (
        <>
          <SectionHeader title="Ekler" />
          <Card>
            {attachments.map((a, i) => (
              <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.divider }}>
                <Icon name={a.type === "LINK" ? "link-outline" : "document-attach-outline"} size={16} color={t.colors.textMuted} />
                <Text style={[t.typography.body, { color: t.colors.text }]} numberOfLines={1}>
                  {a.title || a.fileName || "Ek"}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Yorumlar" />
      <Card>
        {comments.length === 0 ? (
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Henüz yorum yok.</Text>
        ) : (
          comments.map((c, i) => (
            <View key={c.id} style={{ paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.divider }}>
              <Text style={[t.typography.body, { color: t.colors.text }]}>{c.body}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>{relativeDayLabel(new Date(c.createdAt))}</Text>
            </View>
          ))
        )}
        <View style={{ marginTop: 12, gap: 8 }}>
          <TextField label="Yorum ekle" value={commentBody} onChangeText={setCommentBody} placeholder="Yorumunuzu yazın" multiline numberOfLines={2} />
          {commentError ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{commentError}</Text> : null}
          <Button label="Gönder" size="sm" onPress={onAddComment} disabled={!commentBody.trim()} loading={commentBusy} />
        </View>
      </Card>

      <SectionHeader title="Etkinlik" />
      {activity.length === 0 ? (
        <EmptyState icon="time-outline" title="Henüz etkinlik yok" />
      ) : (
        <Card>
          {activity.slice(0, 10).map((a, i) => (
            <View key={a.id} style={{ paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.divider }}>
              <Text style={[t.typography.body, { color: t.colors.text }]}>{a.summary}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>{relativeDayLabel(new Date(a.createdAt))}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
