import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { isPast } from "../../../src/lib/date";
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LessonCard,
  LoadingSkeleton,
  Screen,
  SearchInput,
  SectionHeader,
  StatusBadge,
} from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useNow } from "../../../src/hooks/use-now";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminStudentsResponse, AttendanceSummary, ScheduleResponse } from "../../../src/types/api";

export default function AdminYoklama() {
  const t = useTheme();
  const now = useNow();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);

  const students = useApiGet<AdminStudentsResponse>("/api/v1/students");
  const schedule = useApiGet<ScheduleResponse>(selectedId ? `/api/v1/students/${selectedId}/schedule` : "");
  const attendance = useApiGet<AttendanceSummary>(selectedId ? `/api/v1/students/${selectedId}/attendance-summary` : "");

  const filteredStudents = useMemo(() => {
    if (students.status !== "success") return [];
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return [];
    return students.data.students.filter((s) => s.name.toLocaleLowerCase("tr-TR").includes(q)).slice(0, 8);
  }, [students, query]);

  const pendingLessons = useMemo(() => {
    if (schedule.status !== "success") return [];
    return schedule.data.lessons.filter((l) => isPast(l.endAt, now) && !l.lessonProcessed && !l.studentAttended && !l.studentAbsent && !l.studentExcused);
  }, [schedule, now]);

  async function markAttendance(lessonId: string, flag: "attended" | "absent" | "excused") {
    setBusyLessonId(lessonId);
    await apiPost(`/api/v1/lessons/${lessonId}/ops`, { flag });
    setBusyLessonId(null);
    schedule.refresh();
    attendance.refresh();
  }

  const selectedStudent = students.status === "success" ? students.data.students.find((s) => s.id === selectedId) : undefined;

  return (
    <Screen>
      <AppHeader title="Yoklama" showBack showNotifications={false} />

      <SearchInput value={query} onChangeText={(v) => { setQuery(v); setSelectedId(null); }} placeholder="Öğrenci ara" />

      {!selectedId && query.trim() ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          {filteredStudents.length === 0 ? (
            <EmptyState icon="search-outline" title="Öğrenci bulunamadı" />
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
          <SectionHeader title={selectedStudent?.name ?? "Öğrenci"} actionLabel="Değiştir" onAction={() => { setSelectedId(null); setQuery(""); }} />

          {attendance.status === "loading" ? (
            <LoadingSkeleton rows={1} />
          ) : attendance.status === "error" ? (
            <ErrorState message={attendance.message} onRetry={attendance.refresh} />
          ) : (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <Card style={{ flex: 1 }}>
                <Text style={[t.typography.screenTitle, { color: t.colors.success }]}>{attendance.data.attended}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Katıldı</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={[t.typography.screenTitle, { color: t.colors.danger }]}>{attendance.data.absent}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Gelmedi</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={[t.typography.screenTitle, { color: t.colors.warning }]}>{attendance.data.pending}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Bekliyor</Text>
              </Card>
            </View>
          )}

          <SectionHeader title="Yoklama bekleyen dersler" />
          {schedule.status === "loading" ? (
            <LoadingSkeleton rows={3} />
          ) : schedule.status === "error" ? (
            <ErrorState message={schedule.message} onRetry={schedule.refresh} />
          ) : pendingLessons.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title="Bekleyen yoklama yok" />
          ) : (
            <View style={{ gap: 10 }}>
              {pendingLessons.map((l) => (
                <View key={l.id}>
                  <LessonCard lesson={l} personName={l.teacherName ?? "Öğretmen"} />
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    <Button label="Katıldı" size="sm" loading={busyLessonId === l.id} onPress={() => markAttendance(l.id, "attended")} style={{ flex: 1 }} />
                    <Button label="Gelmedi" size="sm" variant="danger" loading={busyLessonId === l.id} onPress={() => markAttendance(l.id, "absent")} style={{ flex: 1 }} />
                    <Button label="İzinli" size="sm" variant="secondary" loading={busyLessonId === l.id} onPress={() => markAttendance(l.id, "excused")} style={{ flex: 1 }} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : !query.trim() ? (
        <EmptyState icon="search-outline" title="Yoklama işlemek için öğrenci arayın" />
      ) : null}
    </Screen>
  );
}
