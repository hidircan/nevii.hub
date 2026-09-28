import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { isPast } from "../../../src/lib/date";
import {
  AppHeader,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LessonCard,
  LoadingSkeleton,
  Screen,
  SearchInput,
  SectionHeader,
} from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useLocale } from "../../../src/i18n/locale-context";
import { useNow } from "../../../src/hooks/use-now";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminStudentsResponse, AttendanceSummary, LessonOpsResponse, ScheduleResponse } from "../../../src/types/api";

const FLAG_KEY: Record<string, string> = {
  attended: "attFlag.flagAttended",
  absent: "attFlag.flagAbsent",
  excused: "attFlag.flagExcused",
  processed: "attFlag.flagProcessed",
  makeup: "attFlag.flagMakeup",
};

export default function AdminYoklama() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const now = useNow();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{ lessonId: string; flag: "attended" | "absent" | "excused"; from: string } | null>(null);

  const trimmed = query.trim();
  const students = useApiGet<AdminStudentsResponse>(
    trimmed ? `/api/v1/students?q=${encodeURIComponent(trimmed)}&limit=8` : ""
  );
  const schedule = useApiGet<ScheduleResponse>(selectedId ? `/api/v1/students/${selectedId}/schedule` : "");
  const attendance = useApiGet<AttendanceSummary>(selectedId ? `/api/v1/students/${selectedId}/attendance-summary` : "");

  // Sunucu `q` ile filtreler — istemci tarafı filtreleme yok.
  const filteredStudents = students.status === "success" ? students.data.students : [];

  const pendingLessons = useMemo(() => {
    if (schedule.status !== "success") return [];
    return schedule.data.lessons.filter((l) => isPast(l.endAt, now) && !l.lessonProcessed && !l.studentAttended && !l.studentAbsent && !l.studentExcused);
  }, [schedule, now]);

  async function markAttendance(lessonId: string, flag: "attended" | "absent" | "excused", confirmSwitch = false) {
    setBusyLessonId(lessonId);
    setOpsError(null);
    const res = await apiPost<LessonOpsResponse>(`/api/v1/lessons/${lessonId}/ops`, { flag, confirmSwitch });
    setBusyLessonId(null);
    if (!res.ok) {
      setOpsError(res.error.message || tr("adm.yokSaveFail"));
      return;
    }
    // Sunucu farklı statüden geçişte onay ister (web ile aynı akış) —
    // sessiz üzerine yazma YOK.
    if (res.data.needsConfirmation) {
      setPendingSwitch({ lessonId, flag, from: res.data.currentStatus ?? "?" });
      return;
    }
    schedule.refresh();
    attendance.refresh();
  }

  const selectedStudent = students.status === "success" ? students.data.students.find((s) => s.id === selectedId) : undefined;

  return (
    <Screen>
      <AppHeader title={tr("adm.yokTitle")} showBack showNotifications={false} />

      <SearchInput value={query} onChangeText={(v) => { setQuery(v); setSelectedId(null); }} placeholder={tr("adm.yokSearch")} />

      {!selectedId && query.trim() ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          {students.status === "loading" ? (
            <LoadingSkeleton rows={2} />
          ) : students.status === "error" ? (
            <ErrorState message={students.message} onRetry={students.refresh} />
          ) : filteredStudents.length === 0 ? (
            <EmptyState icon="search-outline" title={tr("adm.yokEmpty")} />
          ) : (
            filteredStudents.map((s) => (
              <Card key={s.id} onPress={() => setSelectedId(s.id)}>
                <Text style={[t.typography.body, { color: t.colors.text }]}>{s.name}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{s.teacherName ?? "—"}</Text>
              </Card>
            ))
          )}
        </View>
      ) : null}

      {selectedId ? (
        <>
          <SectionHeader title={selectedStudent?.name ?? tr("adm.yokFallback")} actionLabel={tr("adm.yokChange")} onAction={() => { setSelectedId(null); setQuery(""); }} />

          {attendance.status === "loading" ? (
            <LoadingSkeleton rows={1} />
          ) : attendance.status === "error" ? (
            <ErrorState message={attendance.message} onRetry={attendance.refresh} />
          ) : (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <Card style={{ flex: 1 }}>
                <Text style={[t.typography.screenTitle, { color: t.colors.success }]}>{attendance.data.attended}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("attFlag.flagAttended")}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={[t.typography.screenTitle, { color: t.colors.danger }]}>{attendance.data.absent}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("attFlag.flagAbsent")}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={[t.typography.screenTitle, { color: t.colors.warning }]}>{attendance.data.pending}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.yokWaiting")}</Text>
              </Card>
            </View>
          )}

          <SectionHeader title={tr("adm.yokPendingTitle")} />
          {opsError ? (
            <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
              <Text style={[t.typography.body, { color: t.colors.danger }]}>{opsError}</Text>
            </Card>
          ) : null}
          {schedule.status === "loading" ? (
            <LoadingSkeleton rows={3} />
          ) : schedule.status === "error" ? (
            <ErrorState message={schedule.message} onRetry={schedule.refresh} />
          ) : pendingLessons.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title={tr("adm.yokNoPending")} />
          ) : (
            <View style={{ gap: 10 }}>
              {pendingLessons.map((l) => (
                <View key={l.id}>
                  <LessonCard lesson={l} personName={l.teacherName ?? tr("adm.progTeacherFb")} />
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    <Button label={tr("attFlag.flagAttended")} size="sm" loading={busyLessonId === l.id} onPress={() => markAttendance(l.id, "attended")} style={{ flex: 1 }} />
                    <Button label={tr("attFlag.flagAbsent")} size="sm" variant="danger" loading={busyLessonId === l.id} onPress={() => markAttendance(l.id, "absent")} style={{ flex: 1 }} />
                    <Button label={tr("attFlag.flagExcused")} size="sm" variant="secondary" loading={busyLessonId === l.id} onPress={() => markAttendance(l.id, "excused")} style={{ flex: 1 }} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : !query.trim() ? (
        <EmptyState icon="search-outline" title={tr("adm.yokSearchPrompt")} />
      ) : null}

      <ConfirmDialog
        visible={!!pendingSwitch}
        title={tr("adm.lesSwitchTitle")}
        message={
          pendingSwitch
            ? tr("adm.lesSwitchMsg", { from: FLAG_KEY[pendingSwitch.from] ? tr(FLAG_KEY[pendingSwitch.from]) : pendingSwitch.from, to: tr(FLAG_KEY[pendingSwitch.flag]) })
            : undefined
        }
        confirmLabel={tr("adm.lesSwitchConfirm")}
        onConfirm={() => {
          if (!pendingSwitch) return;
          const { lessonId, flag } = pendingSwitch;
          setPendingSwitch(null);
          void markAttendance(lessonId, flag, true);
        }}
        onCancel={() => setPendingSwitch(null)}
      />
    </Screen>
  );
}
