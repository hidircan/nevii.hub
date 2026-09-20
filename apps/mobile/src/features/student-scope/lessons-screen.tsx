import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader, Avatar, Card, EmptyState, ErrorState, Icon, LessonCard, LoadingSkeleton, Screen, StatusBadge } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useSelectedStudentId } from "../../student/student-context";
import { addDays, format, isSameDay, shortDayMonth, startOfDay, startOfWeek } from "../../lib/date";
import { studentFacingLessonStatus } from "../../lib/lesson-status";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import type { AttendanceCalendarMonthResponse, ScheduleResponse, StudentProfile } from "../../types/api";

const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/** Öğrenci kaydı artık erişilemez/pasif olduğunda genel teknik mesaj yerine anlaşılır bir açıklama gösterir. */
function friendlyAccessMessage(code: string, message: string): string {
  if (code === "NOT_FOUND" || code === "FORBIDDEN") {
    return "Hesabınız artık aktif değil veya bu kayda erişiminiz kaldırılmış. Lütfen okulunuzla iletişime geçin.";
  }
  return message;
}

export function StudentScopeLessonsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const studentId = useSelectedStudentId();
  const router = useRouter();
  const now = new Date();
  const today = startOfDay(now);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const profile = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const res = useApiGet<ScheduleResponse>(
    studentId
      ? `/api/v1/students/${studentId}/schedule?from=${weekStart.toISOString()}&to=${weekEndExclusive.toISOString()}`
      : ""
  );
  const calendar = useApiGet<AttendanceCalendarMonthResponse>(
    studentId
      ? `/api/v1/attendance-calendar/month?studentId=${studentId}&year=${weekStart.getFullYear()}&month=${weekStart.getMonth() + 1}`
      : ""
  );

  const weekLessonsByDay = useMemo(() => {
    if (res.status !== "success") return weekDays.map(() => [] as ScheduleResponse["lessons"]);
    const sorted = [...res.data.lessons].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return weekDays.map((day) => sorted.filter((l) => isSameDay(new Date(l.startAt), day)));
  }, [res, weekDays]);

  const weekHasNoLessons = weekLessonsByDay.every((dayLessons) => dayLessons.length === 0);

  const dayStatusByKey = useMemo(() => {
    if (calendar.status !== "success") return new Map<string, AttendanceCalendarMonthResponse["days"][number]>();
    return new Map(calendar.data.days.map((d) => [d.date, d]));
  }, [calendar]);

  // Bugünün dersi / sıradaki ders — gerçek programdan, tüm haftalar için
  // değil yalnızca bugün için (hangi hafta gösteriliyor olursa olsun, bu
  // özet her zaman gerçek "şu an"a göre hesaplanır).
  const todayLessons = useMemo(() => {
    if (res.status !== "success" || !isCurrentWeek) return [];
    return res.data.lessons
      .filter((l) => isSameDay(new Date(l.startAt), today))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [res, isCurrentWeek, today]);
  const nowTs = now.getTime();
  const currentOrNextTodayLesson =
    todayLessons.find((l) => new Date(l.startAt).getTime() <= nowTs && new Date(l.endAt).getTime() >= nowTs) ??
    todayLessons.find((l) => new Date(l.startAt).getTime() > nowTs);

  const weekLabel = `${shortDayMonth(weekStart)} – ${shortDayMonth(weekDays[6]!)}`;
  const studentName = profile.status === "success" ? profile.data.name : undefined;

  function refreshAll() {
    profile.refresh();
    res.refresh();
    calendar.refresh();
  }

  return (
    <Screen onRefresh={refreshAll} refreshing={res.status === "loading"}>
      <AppHeader title="Program" subtitle={studentName ? `${studentName} — haftalık ders programı` : "Haftalık ders programı"} showAccount={`${basePath}/hesabim`} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki hafta" hitSlop={8} onPress={() => setWeekStart((d) => addDays(d, -7))} style={{ padding: 6 }}>
          <Icon name="chevron-back" size={20} color={t.colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</Text>
          {!isCurrentWeek ? (
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(startOfWeek(now))} hitSlop={6} style={{ marginTop: 4 }}>
              <Text style={[t.typography.caption, { color: t.colors.primary, fontFamily: t.fonts.serifBold, fontWeight: "700" }]}>Bu haftaya dön</Text>
            </Pressable>
          ) : (
            <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>Bu hafta</Text>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sonraki hafta" hitSlop={8} onPress={() => setWeekStart((d) => addDays(d, 7))} style={{ padding: 6 }}>
          <Icon name="chevron-forward" size={20} color={t.colors.text} />
        </Pressable>
      </View>

      {isCurrentWeek ? (
        <Card style={{ marginTop: 14 }}>
          {currentOrNextTodayLesson ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.timeBlock, { backgroundColor: t.colors.primarySoft }]}>
                <Text style={[t.typography.cardTitle, { color: t.colors.primaryStrong }]}>{format(new Date(currentOrNextTodayLesson.startAt), "HH:mm")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>
                  {new Date(currentOrNextTodayLesson.startAt).getTime() <= nowTs ? "Şu anki ders" : "Bugünün sıradaki dersi"}
                </Text>
                <Text style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 2 }]}>
                  {currentOrNextTodayLesson.teacherName ?? "Öğretmen"}
                </Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                  {[currentOrNextTodayLesson.instrument, currentOrNextTodayLesson.roomName].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="checkmark-circle-outline" size={20} color={t.colors.textMuted} />
              <Text style={[t.typography.body, { color: t.colors.textMuted }]}>Bugün için planlanmış ders yok</Text>
            </View>
          )}
        </Card>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={friendlyAccessMessage(res.code, res.message)} onRetry={refreshAll} />
      ) : weekHasNoLessons ? (
        <View style={{ marginTop: 12 }}>
          <EmptyState icon="calendar-outline" title="Bu hafta ders yok" description="Bu hafta için planlanmış bir ders bulunmuyor." />
        </View>
      ) : (
        <View style={{ marginTop: 16, gap: 14 }}>
          {weekDays.map((day, i) => {
            const dayLessons = weekLessonsByDay[i]!;
            const isToday = isSameDay(day, now);
            const dayStatus = dayStatusByKey.get(format(day, "yyyy-MM-dd"));
            return (
              <View key={day.toISOString()}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Text style={[t.typography.bodyStrong, { color: isToday ? t.colors.primary : t.colors.text }]}>
                    {DAY_NAMES[i]}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{shortDayMonth(day)}</Text>
                  {isToday ? (
                    <View style={[styles.todayPill, { backgroundColor: t.colors.primary }]}>
                      <Text style={[t.typography.label, { color: t.colors.primaryOn }]}>BUGÜN</Text>
                    </View>
                  ) : null}
                </View>
                {dayLessons.length > 0 ? (
                  <View style={{ gap: 10 }}>
                    {dayLessons.map((l) => (
                      <LessonCard key={l.id} lesson={l} studentFacing personName={l.teacherName ?? "Öğretmen"} onPress={() => router.push(`${basePath}/dersler/${l.id}`)} />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.emptyDayRow, { borderColor: t.colors.border }]}>
                    <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>
                      {dayStatus?.status === "closed" ? dayStatus.label : "Ders yok"}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  timeBlock: { width: 56, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  todayPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  emptyDayRow: { borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
});

// Devamsızlık bildirimi bölümü kaldırıldı (2026-09-13): backend'de "absence notice"
// domain'i ve absence-notices API route'u hiç yok — çağrı her zaman 404 alıyordu.
// Karar: docs/mobile/MOBILE_API_ROUTE_DECISIONS.md.

export function StudentScopeLessonDetailScreen({ lessonId }: { lessonId: string }) {
  const t = useTheme();
  const base = usePersonaBasePath();
  const studentId = useSelectedStudentId();
  const res = useApiGet<ScheduleResponse>(studentId ? `/api/v1/students/${studentId}/schedule` : "");

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />
        <ErrorState message={friendlyAccessMessage(res.code, res.message)} onRetry={res.refresh} />
      </Screen>
    );
  }

  const lesson = res.data.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title="Ders" showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title="Ders bulunamadı" />
      </Screen>
    );
  }

  const badge = studentFacingLessonStatus(lesson);

  return (
    <Screen>
      <AppHeader title={lesson.teacherName ?? "Öğretmen"} showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={lesson.teacherName ?? "?"} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.teacherName ?? "Öğretmen"}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {format(new Date(lesson.startAt), "yyyy-MM-dd")} · {format(new Date(lesson.startAt), "HH:mm")}–{format(new Date(lesson.endAt), "HH:mm")}
            </Text>
          </View>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={{ gap: 8 }}>
          {lesson.instrument ? (
            <Text style={[t.typography.body, { color: t.colors.text }]}>Enstrüman: {lesson.instrument}</Text>
          ) : null}
          {lesson.roomName ? <Text style={[t.typography.body, { color: t.colors.text }]}>Oda: {lesson.roomName}</Text> : null}
        </View>
      </Card>
    </Screen>
  );
}
