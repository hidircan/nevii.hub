import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LessonCard,
  LoadingSkeleton,
  Screen,
  SectionHeader,
} from "../../../src/components/ui";
import { useAppForegroundRefetch } from "../../../src/hooks/use-app-foreground-refetch";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { addDays, format, isSameDay, shortDayMonth, startOfDay, startOfWeek, weekdayName } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkResponse, ScheduleResponse } from "../../../src/types/api";

/**
 * Öğretmen ana ekranı — ayrıntılı HAFTALIK DERS PROGRAMI (varsayılan görünüm).
 *
 * Ürün kuralları:
 * - Kapanış-bekleyen alanı YOK (öğretmen yoklama almaz, ders
 *   başlatmaz/bitirmez).
 * - Yoklama durumu ne rozet ne CTA olarak görünmez (`showStatus={false}`);
 *   kartlarda şube adı + oda bilgisi gösterilir.
 * - Ders detayı salt-okunur bilgi + izinli ödev/değerlendirme akışlarına gider.
 */
export default function TeacherBugun() {
  const { user } = useAuth();
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const schedule = useApiGet<ScheduleResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/schedule` : "");
  const homework = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  function refreshAll() {
    schedule.refresh();
    homework.refresh();
  }
  function refreshAllAuto() {
    schedule.autoRefresh();
    homework.autoRefresh();
  }
  useFocusRefetch(refreshAllAuto);
  useAppForegroundRefetch(refreshAllAuto);

  const weekLessons = useMemo(
    () => (schedule.status === "success" ? schedule.data.lessons : []),
    [schedule]
  );
  const lessonsByDay = useMemo(
    () =>
      weekDays.map((day) =>
        weekLessons
          .filter((l) => isSameDay(new Date(l.startAt), day))
          .sort((a, b) => a.startAt.localeCompare(b.startAt))
      ),
    [weekLessons, weekDays]
  );
  const closedDays = useMemo(
    () => (schedule.status === "success" ? (schedule.data.weeklyClosedDays ?? []) : []),
    [schedule]
  );
  const weekCount = useMemo(() => lessonsByDay.reduce((n, list) => n + list.length, 0), [lessonsByDay]);

  const studentsWithoutTodayHomework = useMemo(() => {
    if (homework.status !== "success") return [];
    const assignedTodayStudentIds = new Set(
      homework.data.homework.filter((h) => h.createdAt?.startsWith(today)).map((h) => h.studentId)
    );
    const names = weekLessons
      .filter((l) => l.startAt.startsWith(today))
      .filter((l) => l.lessonProcessed || l.studentAttended)
      .filter((l) => l.studentId && !assignedTodayStudentIds.has(l.studentId))
      // Ham ad — dil değişiminde yeniden çözülmesi için geri plan metni render'da kurulur.
      .map((l) => l.studentName ?? null);
    return [...new Set(names)];
  }, [homework, weekLessons, today]);

  if (!user?.teacherId) {
    return (
      <Screen>
        <AppHeader title={tr("tabs.program")} />
        <EmptyState icon="alert-circle-outline" title={tr("teach.noAccount")} description={tr("teach.noAccountBody")} />
      </Screen>
    );
  }

  const weekEnd = weekDays[6]!;
  const weekLabel = `${shortDayMonth(weekStart)} – ${shortDayMonth(weekEnd)}`;

  return (
    <Screen onRefresh={refreshAll} refreshing={schedule.status === "loading"}>
      <AppHeader
        title={tr("tabs.program")}
        subtitle={schedule.status === "success" ? `${weekLabel} · ${tr("teach.weekLessons", { n: weekCount })}` : weekLabel}
        showAccount="/(teacher)/hesabim"
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("lessons.prevWeek")}
          hitSlop={8}
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="chevron-back" size={22} color={t.colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("lessons.backToWeek")}
          accessibilityHint={weekLabel}
          onPress={() => setWeekStart(startOfWeek(now))}
          style={{ flex: 1, alignItems: "center", minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</Text>
          {!isCurrentWeek ? (
            <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 2 }]}>{tr("lessons.backToWeek")}</Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("lessons.nextWeek")}
          hitSlop={8}
          onPress={() => setWeekStart((w) => addDays(w, 7))}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="chevron-forward" size={22} color={t.colors.text} />
        </Pressable>
      </View>

      {studentsWithoutTodayHomework.length > 0 ? (
        <Card style={{ borderColor: t.colors.warning, backgroundColor: t.colors.warningSoft }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Icon name="alert-circle" size={18} color={t.colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("teach.noHomeworkTitle")}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                {tr("teach.noHomeworkBody", { names: studentsWithoutTodayHomework.map((n) => n ?? tr("teach.studentFallback")).join(", ") })}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={5} />
      ) : schedule.status === "error" ? (
        <ErrorState message={schedule.message} onRetry={refreshAll} />
      ) : (
        <View style={{ gap: 16, marginTop: 4 }}>
          {weekDays.map((day, i) => {
            const lessons = lessonsByDay[i] ?? [];
            const isToday = isSameDay(day, startOfDay(now));
            const closed = closedDays.includes(day.getDay());
            return (
              <View key={day.toISOString()}>
                <SectionHeader
                  title={`${weekdayName(day)} · ${shortDayMonth(day)}${isToday ? tr("teach.todaySuffix") : ""}`}
                />
                {closed ? (
                  <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{tr("teach.closedDay")}</Text>
                ) : lessons.length === 0 ? (
                  <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{tr("teach.noPlannedDay")}</Text>
                ) : (
                  <View style={{ gap: 10 }}>
                    {lessons.map((lesson) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        showStatus={false}
                        personName={lesson.studentName ?? tr("teach.studentFallback")}
                        onPress={() => router.push(`/(teacher)/bugun/${lesson.id}`)}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("teach.myMakeups")}
        hitSlop={8}
        onPress={() => router.push("/(teacher)/telafi")}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, minHeight: 44 }}
      >
        <Icon name="swap-horizontal-outline" size={16} color={t.colors.primary} />
        <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>{tr("teach.makeups")}</Text>
      </Pressable>
    </Screen>
  );
}
