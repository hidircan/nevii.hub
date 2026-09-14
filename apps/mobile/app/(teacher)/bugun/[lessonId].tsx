import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/auth-context";
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  HomeworkCard,
  Icon,
  LiveLessonTimer,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatusBadge,
} from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useNow } from "../../../src/hooks/use-now";
import { useAppForegroundRefetch } from "../../../src/hooks/use-app-foreground-refetch";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { classifyOpsResult, createInFlightGuard, OPS_FLAG_LABEL, type OpsFlag } from "../../../src/lib/attendance";
import { format, isPast } from "../../../src/lib/date";
import { lessonStatusBadge } from "../../../src/lib/lesson-status";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkResponse, ScheduleResponse } from "../../../src/types/api";

export default function LessonDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const now = useNow();
  const { user } = useAuth();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const [guard] = useState(createInFlightGuard);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<OpsFlag | null>(null);

  // Ders yalnız öğretmenin KENDİ programından bulunur (sunucu teacherId sahipliğini doğrular);
  // listede yoksa "bulunamadı" gösterilir — başka bir kaynaktan tahmin edilmez.
  const schedule = useApiGet<ScheduleResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/schedule` : "");
  useFocusRefetch(schedule.refresh);
  useAppForegroundRefetch(schedule.refresh);
  const lesson = schedule.status === "success" ? schedule.data.lessons.find((l) => l.id === lessonId) : undefined;

  const homework = useApiGet<HomeworkResponse>(lesson?.studentId ? `/api/v1/students/${lesson.studentId}/homework` : "");

  function runOps(flag: OpsFlag, confirmSwitch = false) {
    void guard.run(async () => {
      setBusyAction(flag);
      setActionError(null);
      setNotice(null);
      const res = await apiPost<{ needsConfirmation?: boolean; alreadySet?: boolean }>(
        `/api/v1/lessons/${lessonId}/ops`,
        confirmSwitch ? { flag, confirmSwitch: true } : { flag }
      );
      setBusyAction(null);
      const outcome = classifyOpsResult(res);
      if (outcome.kind === "confirm") {
        setPendingSwitch(flag);
        return;
      }
      if (outcome.kind === "error") setActionError(outcome.message);
      else setNotice(outcome.message);
      schedule.refresh();
    });
  }

  function runLifecycle(action: "start" | "end") {
    void guard.run(async () => {
      setBusyAction(action);
      setActionError(null);
      setNotice(null);
      const res = await apiPost(`/api/v1/lessons/${lessonId}/${action}`);
      setBusyAction(null);
      if (!res.ok) setActionError(res.error.message);
      schedule.refresh();
    });
  }

  if (schedule.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (schedule.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <ErrorState message={schedule.message} onRetry={schedule.refresh} code={schedule.code} />
      </Screen>
    );
  }
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title="Ders bulunamadı" description="Bu ders programınızda yok veya erişim kapsamınız dışında." />
      </Screen>
    );
  }

  const badge = lessonStatusBadge(lesson);
  const past = isPast(lesson.endAt, now);
  const busy = busyAction !== null;

  return (
    <Screen onRefresh={schedule.refresh} refreshing={false}>
      <AppHeader title={lesson.studentName ?? "Öğrenci"} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={lesson.studentName ?? "?"} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.studentName ?? "Öğrenci"}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {format(new Date(lesson.startAt), "HH:mm")}–{format(new Date(lesson.endAt), "HH:mm")}
              {lesson.instrument ? ` · ${lesson.instrument}` : ""}
              {lesson.roomName ? ` · ${lesson.roomName}` : ""}
            </Text>
          </View>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
      </Card>

      {actionError ? (
        <Card style={{ borderColor: t.colors.danger, backgroundColor: t.colors.dangerSoft, marginTop: 12 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: t.colors.danger }}>
            {actionError}
          </Text>
        </Card>
      ) : null}
      {notice ? (
        <Card style={{ borderColor: t.colors.success, backgroundColor: t.colors.successSoft, marginTop: 12 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: t.colors.success }}>
            {notice}
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Yoklama" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Katıldı" size="sm" variant={lesson.studentAttended ? "primary" : "secondary"} loading={busyAction === "attended"} disabled={busy} onPress={() => runOps("attended")} />
        <Button label="Gelmedi" size="sm" variant={lesson.studentAbsent ? "danger" : "secondary"} loading={busyAction === "absent"} disabled={busy} onPress={() => runOps("absent")} />
        <Button label="İzinli" size="sm" variant={lesson.studentExcused ? "primary" : "secondary"} loading={busyAction === "excused"} disabled={busy} onPress={() => runOps("excused")} />
      </View>

      {!past ? (
        <>
          <SectionHeader title="Ders akışı" />
          {lesson.status === "in_progress" && lesson.actualStartAt ? (
            <Card style={{ marginBottom: 10 }}>
              <LiveLessonTimer actualStartAt={lesson.actualStartAt} scheduledEndAt={lesson.endAt} />
            </Card>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="Dersi başlat"
              size="sm"
              variant="secondary"
              icon="play"
              loading={busyAction === "start"}
              disabled={busy || lesson.status !== "scheduled"}
              onPress={() => runLifecycle("start")}
            />
            <Button
              label="Dersi bitir"
              size="sm"
              variant="secondary"
              icon="stop"
              loading={busyAction === "end"}
              disabled={busy || lesson.status !== "in_progress"}
              onPress={() => runLifecycle("end")}
            />
          </View>
        </>
      ) : null}

      <SectionHeader title="Eylemler" />
      <View style={{ gap: 8 }}>
        <Button
          label="Ödev ver"
          icon="add-circle-outline"
          onPress={() =>
            router.push(
              `/(teacher)/odevler/yeni?studentId=${lesson.studentId}&studentName=${encodeURIComponent(lesson.studentName ?? "")}`
            )
          }
        />
        <Button
          label="Gelişim değerlendirmesi ekle"
          variant="secondary"
          icon="school-outline"
          onPress={() =>
            router.push(
              `/assessment/${lesson.id}?studentId=${lesson.studentId}&studentName=${encodeURIComponent(lesson.studentName ?? "")}`
            )
          }
        />
      </View>

      <SectionHeader title="Geçmiş ödevler" />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : homework.status === "error" ? (
        <ErrorState message={homework.message} onRetry={homework.refresh} code={homework.code} />
      ) : homework.data.homework.length === 0 ? (
        <EmptyState icon="book-outline" title="Henüz ödev verilmemiş" />
      ) : (
        <View style={{ gap: 10 }}>
          {homework.data.homework.slice(0, 5).map((h) => (
            <HomeworkCard key={h.id} homework={h} showStudentName={false} />
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
        <Icon name="information-circle-outline" size={14} color={t.colors.textFaint} />
        <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>
          İletişim ve gelişim notları için &quot;Gelişim değerlendirmesi ekle&quot; kullanılır.
        </Text>
      </View>

      <ConfirmDialog
        visible={pendingSwitch !== null}
        title="Yoklama değiştirilsin mi?"
        message={
          pendingSwitch
            ? `Bu ders için kayıtlı yoklama "${OPS_FLAG_LABEL[pendingSwitch]}" olarak değiştirilecek.`
            : ""
        }
        confirmLabel="Değiştir"
        onCancel={() => setPendingSwitch(null)}
        onConfirm={() => {
          const flag = pendingSwitch;
          setPendingSwitch(null);
          if (flag) runOps(flag, true);
        }}
      />
    </Screen>
  );
}
