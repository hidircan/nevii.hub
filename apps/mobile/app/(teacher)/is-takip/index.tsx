import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, EmptyState, ErrorState, FilterChip, FloatingActionButton, LoadingSkeleton, Screen, TaskCard } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { TASK_SEGMENTS, taskSegmentQuery, type TaskSegment } from "../../../src/lib/task-segments";
import { useLocale } from "../../../src/i18n/locale-context";
import type { TasksResponse } from "../../../src/types/api";

function buildTasksPath(segment: TaskSegment): string {
  const q = taskSegmentQuery(segment);
  const params = new URLSearchParams();
  if (q.quickFilter) params.set("quickFilter", q.quickFilter);
  for (const s of q.status ?? []) params.append("status", s);
  const qs = params.toString();
  return `/api/v1/tasks${qs ? `?${qs}` : ""}`;
}

export default function IsTakipIndex() {
  const router = useRouter();
  const { t: tr } = useLocale();
  const [segment, setSegment] = useState<TaskSegment>("open");
  const res = useApiGet<TasksResponse>(buildTasksPath(segment));
  const [completingId, setCompletingId] = useState<string | null>(null);

  useFocusRefetch(res.autoRefresh);

  const tasks = useMemo(() => (res.status === "success" ? res.data.tasks : []), [res]);

  async function toggleComplete(taskId: string, isDone: boolean) {
    setCompletingId(taskId);
    await apiPost("/api/v1/tasks/" + taskId, { status: isDone ? "TODO" : "COMPLETED" });
    setCompletingId(null);
    res.refresh();
  }

  return (
    <Screen
      floatingAction={<FloatingActionButton icon="add" accessibilityLabel={tr("tasks.newTask")} onPress={() => router.push("/(teacher)/is-takip/yeni")} />}
    >
      <AppHeader title={tr("tasks.title")} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {TASK_SEGMENTS.map((s) => (
            <FilterChip key={s.key} label={tr(s.labelKey)} selected={segment === s.key} onPress={() => setSegment(s.key)} />
          ))}
        </View>
      </ScrollView>

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : tasks.length === 0 ? (
        <EmptyState icon="checkbox-outline" title={tr("tasks.emptySegment")} />
      ) : (
        <View style={{ gap: 10 }}>
          {tasks.map((task) => {
            const isDone = task.status === "COMPLETED";
            return (
              <TaskCard
                key={task.id}
                task={completingId === task.id ? { ...task, status: isDone ? "TODO" : "COMPLETED" } : task}
                onPress={() => router.push(`/(teacher)/is-takip/${task.id}`)}
                onComplete={() => toggleComplete(task.id, isDone)}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}
