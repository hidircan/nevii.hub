import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { apiPost } from "../../../../src/api/client";
import { AppHeader, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatCard, TaskCard } from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { TASK_SEGMENTS, taskSegmentQuery, type TaskSegment } from "../../../../src/lib/task-segments";
import type { TaskKpiSummary, TasksResponse } from "../../../../src/types/api";

function buildTasksPath(segment: TaskSegment): string {
  const q = taskSegmentQuery(segment);
  const params = new URLSearchParams();
  if (q.quickFilter) params.set("quickFilter", q.quickFilter);
  for (const s of q.status ?? []) params.append("status", s);
  const qs = params.toString();
  return `/api/v1/tasks${qs ? `?${qs}` : ""}`;
}

export default function AdminIsTakip() {
  const router = useRouter();
  const [segment, setSegment] = useState<TaskSegment>("open");
  const res = useApiGet<TasksResponse>(buildTasksPath(segment));
  const kpi = useApiGet<TaskKpiSummary>("/api/v1/tasks/kpi");
  const [completingId, setCompletingId] = useState<string | null>(null);

  const tasks = useMemo(() => (res.status === "success" ? res.data.tasks : []), [res]);

  async function toggleComplete(taskId: string, isDone: boolean) {
    setCompletingId(taskId);
    await apiPost("/api/v1/tasks/" + taskId, { status: isDone ? "TODO" : "COMPLETED" });
    setCompletingId(null);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="İş Takip" showBack showNotifications={false} />

      {kpi.status === "success" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatCard icon="albums-outline" label="Açık görev" value={kpi.data.openCount} />
            <StatCard icon="today-outline" label="Bugün son tarih" value={kpi.data.dueTodayCount} tone="warning" />
            <StatCard icon="alert-circle-outline" label="Gecikmiş" value={kpi.data.overdueCount} tone="danger" />
            <StatCard icon="checkmark-circle-outline" label="Bu hafta tamamlanan" value={kpi.data.completedThisWeekCount} tone="success" />
          </View>
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {TASK_SEGMENTS.map((s) => (
            <FilterChip key={s.key} label={s.label} selected={segment === s.key} onPress={() => setSegment(s.key)} />
          ))}
        </View>
      </ScrollView>

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : tasks.length === 0 ? (
        <EmptyState icon="checkbox-outline" title="Bu segmentte görev yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {tasks.map((task) => {
            const isDone = task.status === "COMPLETED";
            return (
              <TaskCard
                key={task.id}
                task={completingId === task.id ? { ...task, status: isDone ? "TODO" : "COMPLETED" } : task}
                onPress={() => router.push(`/(admin)/islemler/is-takip/${task.id}`)}
                onComplete={() => toggleComplete(task.id, isDone)}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}
