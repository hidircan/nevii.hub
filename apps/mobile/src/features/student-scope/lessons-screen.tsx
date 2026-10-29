import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader, Avatar, Card, EmptyState, ErrorState, Icon, LessonCard, LoadingSkeleton, Screen, StatusBadge, AppText } from "../../components/ui";
import { CacheStatus } from "../../cache/cache-status";
import { useCachedApiGet } from "../../cache/use-cached-api";
import { useSelectedStudentId } from "../../student/student-context";
import { addDays, format, isSameDay, shortDayMonth, startOfDay, startOfWeek, weekdayName } from "../../lib/date";
import { studentFacingLessonStatus } from "../../lib/lesson-status";
import { lookup } from "../../i18n/locales";
import { getActiveLocale } from "../../i18n/locale-store";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import type { AttendanceCalendarMonthResponse, ScheduleResponse, StudentProfile } from "../../types/api";

/** Öğrenci kaydı artık erişilemez/pasif olduğunda genel teknik mesaj yerine anlaşılır bir açıklama gösterir. */
function friendlyAccessMessage(code: string, message: string): string {
  if (code === "NOT_FOUND" || code === "FORBIDDEN") {
    return lookup(getActiveLocale(), "lessons.accessGone");
  }
  return message;
}

export function StudentScopeLessonsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const studentId = useSelectedStudentId();
  const router = useRouter();
  const now = new Date();
  const today = startOfDay(now);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const profile = useCachedApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const res = useCachedApiGet<ScheduleResponse>(
    studentId
      ? `/api/v1/students/${studentId}/schedule?from=${weekStart.toISOString()}&to=${weekEndExclusive.toISOString()}`
      : ""
  );
  const calendar = useCachedApiGet<AttendanceCalendarMonthResponse>(
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
      <AppHeader title={tr("lessons.programTitle")} subtitle={studentName ? tr("lessons.weeklySubtitle", { name: studentName }) : tr("lessons.weeklyDefault")} showAccount={`${basePath}/hesabim`} />
      <CacheStatus cachedAt={res.cachedAt} isStale={res.isStale} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("lessons.prevWeek")} hitSlop={8} onPress={() => setWeekStart((d) => addDays(d, -7))} style={{ padding: 6 }}>
          <Icon name="chevron-back" size={20} color={t.colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</AppText>
          {!isCurrentWeek ? (
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(startOfWeek(now))} hitSlop={6} style={{ marginTop: 4 }}>
              <AppText style={[t.typography.caption, { color: t.colors.primary, fontFamily: t.fonts.bold, fontWeight: "700" }]}>{tr("lessons.backToWeek")}</AppText>
            </Pressable>
          ) : (
            <AppText style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>{tr("lessons.thisWeek")}</AppText>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("lessons.nextWeek")} hitSlop={8} onPress={() => setWeekStart((d) => addDays(d, 7))} style={{ padding: 6 }}>
          <Icon name="chevron-forward" size={20} color={t.colors.text} />
        </Pressable>
      </View>

      {isCurrentWeek ? (
        <Card style={{ marginTop: 14 }}>
          {currentOrNextTodayLesson ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.timeBlock, { backgroundColor: t.colors.primarySoft }]}>
                <AppText style={[t.typography.cardTitle, { color: t.colors.primaryStrong }]}>{format(new Date(currentOrNextTodayLesson.startAt), "HH:mm")}</AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>
                  {new Date(currentOrNextTodayLesson.startAt).getTime() <= nowTs ? tr("lessons.nowLesson") : tr("lessons.nextToday")}
                </AppText>
                <AppText style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 2 }]}>
                  {currentOrNextTodayLesson.teacherName ?? tr("home.teacherFallback")}
                </AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                  {[currentOrNextTodayLesson.instrument, currentOrNextTodayLesson.roomName].filter(Boolean).join(" · ")}
                </AppText>
              </View>
              <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="checkmark-circle-outline" size={20} color={t.colors.textMuted} />
              <AppText style={[t.typography.body, { color: t.colors.textMuted }]}>{tr("lessons.noLessonToday")}</AppText>
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
          <EmptyState icon="calendar-outline" title={tr("lessons.noWeekTitle")} description={tr("lessons.noWeekBody")} />
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
                  <AppText style={[t.typography.bodyStrong, { color: isToday ? t.colors.primary : t.colors.text }]}>
                    {weekdayName(day)}
                  </AppText>
                  <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>{shortDayMonth(day)}</AppText>
                  {isToday ? (
                    <View style={[styles.todayPill, { backgroundColor: t.colors.primary }]}>
                      <AppText style={[t.typography.label, { color: t.colors.primaryOn }]}>{tr("lessons.todayPill")}</AppText>
                    </View>
                  ) : null}
                </View>
                {dayLessons.length > 0 ? (
                  <View style={{ gap: 10 }}>
                    {dayLessons.map((l) => (
                      <LessonCard key={l.id} lesson={l} studentFacing personName={l.teacherName ?? tr("home.teacherFallback")} onPress={() => router.push(`${basePath}/dersler/${l.id}`)} />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.emptyDayRow, { borderColor: t.colors.border }]}>
                    <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>
                      {dayStatus?.status === "closed" ? dayStatus.label : tr("lessons.noLessonDay")}
                    </AppText>
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
  const { t: tr } = useLocale();
  const base = usePersonaBasePath();
  const studentId = useSelectedStudentId();
  // Detay tek dersi ID ile bulur — kesilme payı için üst sınırla çekilir (15dk cache'li).
  const res = useCachedApiGet<ScheduleResponse>(studentId ? `/api/v1/students/${studentId}/schedule?limit=2000` : "");

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("lessons.lessonTitle")} showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("lessons.lessonTitle")} showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />
        <ErrorState message={friendlyAccessMessage(res.code, res.message)} onRetry={res.refresh} />
      </Screen>
    );
  }

  const lesson = res.data.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title={tr("lessons.lessonTitle")} showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("lessons.lessonMissing")} />
      </Screen>
    );
  }

  const badge = studentFacingLessonStatus(lesson);

  return (
    <Screen>
      <AppHeader title={lesson.teacherName ?? tr("home.teacherFallback")} showBack backFallback={listFallback(base, "dersler")} showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={lesson.teacherName ?? "?"} size={48} />
          <View style={{ flex: 1 }}>
            <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.teacherName ?? tr("home.teacherFallback")}</AppText>
            <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {format(new Date(lesson.startAt), "yyyy-MM-dd")} · {format(new Date(lesson.startAt), "HH:mm")}–{format(new Date(lesson.endAt), "HH:mm")}
            </AppText>
          </View>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={{ gap: 8 }}>
          {lesson.instrument ? (
            <AppText style={[t.typography.body, { color: t.colors.text }]}>{tr("lessons.instrument", { v: lesson.instrument })}</AppText>
          ) : null}
          {lesson.roomName ? <AppText style={[t.typography.body, { color: t.colors.text }]}>{tr("lessons.room", { v: lesson.roomName })}</AppText> : null}
        </View>
      </Card>
    </Screen>
  );
}
