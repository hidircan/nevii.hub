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
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { pendingAttendance } from "../../../src/lib/attendance";
import { addDays, format, isSameDay, shortDayMonth, startOfDay, startOfWeek, weekdayName } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkResponse, ScheduleResponse } from "../../../src/types/api";

const DAY_LETTERS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

export default function TeacherBugun() {
  const { user } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(now));
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const schedule = useApiGet<ScheduleResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/schedule` : "");
  const homework = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  useFocusRefetch(() => {
    schedule.refresh();
    homework.refresh();
  });

  const todayLessons = useMemo(
    () => (schedule.status === "success" ? schedule.data.lessons.filter((l) => l.startAt.startsWith(today)) : []),
    [schedule, today]
  );

  const selectedDayLessons = useMemo(
    () =>
      schedule.status === "success"
        ? schedule.data.lessons
            .filter((l) => isSameDay(new Date(l.startAt), selectedDate))
            .sort((a, b) => a.startAt.localeCompare(b.startAt))
        : [],
    [schedule, selectedDate]
  );

  const studentsWithoutTodayHomework = useMemo(() => {
    if (homework.status !== "success") return [];
    const assignedTodayStudentIds = new Set(
      homework.data.homework.filter((h) => h.createdAt?.startsWith(today)).map((h) => h.studentId)
    );
    const completedTodayStudentNames = todayLessons
      .filter((l) => l.lessonProcessed || l.studentAttended)
      .filter((l) => l.studentId && !assignedTodayStudentIds.has(l.studentId))
      .map((l) => l.studentName ?? "Öğrenci");
    return [...new Set(completedTodayStudentNames)];
  }, [homework, todayLessons, today]);

  const nowMs = now.getTime();
  const pendingLessons = useMemo(
    () => (schedule.status === "success" ? pendingAttendance(schedule.data.lessons, nowMs) : []),
    [schedule, nowMs]
  );

  if (!user?.teacherId) {
    return (
      <Screen>
        <AppHeader title="Bugün" />
        <EmptyState icon="alert-circle-outline" title="Öğretmen hesabı bulunamadı" description="Bu hesapta bir öğretmen kimliği yok." />
      </Screen>
    );
  }

  const isSelectedToday = isSameDay(selectedDate, now);
  const weekEnd = weekDays[6]!;
  const weekLabel = `${shortDayMonth(weekStart)} – ${shortDayMonth(weekEnd)}`;

  // Jenerik "Günaydın/İyi günler" selamlaması yerine marka + gerçek bugünkü
  // ders bağlamı — kök gereksinim: dolgu cümle yok, veri yoksa sade başlık.
  const nextTodayLesson = todayLessons
    .filter((l) => new Date(l.startAt).getTime() >= now.getTime())
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const headerContext =
    todayLessons.length === 0
      ? weekdayName(now)
      : nextTodayLesson
        ? `${weekdayName(now)} · ${todayLessons.length} ders · sıradaki ${format(new Date(nextTodayLesson.startAt), "HH:mm")}`
        : `${weekdayName(now)} · ${todayLessons.length} ders bugün`;

  return (
    <Screen onRefresh={schedule.refresh} refreshing={schedule.status === "loading"}>
      <AppHeader title="Nevii Hub" subtitle={headerContext} />

      <Card style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="calendar-outline" size={20} color={t.colors.primary} />
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{todayLessons.length} ders bugün</Text>
        </View>
      </Card>

      {studentsWithoutTodayHomework.length > 0 ? (
        <Card style={{ borderColor: t.colors.warning, backgroundColor: t.colors.warningSoft }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Icon name="alert-circle" size={18} color={t.colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Ödev verilmemiş öğrenciler</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                {studentsWithoutTodayHomework.join(", ")} — bugünkü dersten sonra henüz ödev verilmedi.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {pendingLessons.length > 0 ? (
        <>
          <SectionHeader title={`Kapanış bekleyen dersler (${pendingLessons.length})`} />
          <View style={{ gap: 10 }}>
            {pendingLessons.slice(0, 5).map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                personName={lesson.studentName ?? "Öğrenci"}
                onPress={() => router.push(`/(teacher)/bugun/${lesson.id}`)}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki hafta"
          hitSlop={8}
          onPress={() => setSelectedDate((d) => addDays(d, -7))}
          style={{ padding: 6 }}
        >
          <Icon name="chevron-back" size={20} color={t.colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedDate(startOfDay(now))}
          style={{ flex: 1, alignItems: "center" }}
        >
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</Text>
          {!isSelectedToday ? (
            <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 2 }]}>Bugüne dön</Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki hafta"
          hitSlop={8}
          onPress={() => setSelectedDate((d) => addDays(d, 7))}
          style={{ padding: 6 }}
        >
          <Icon name="chevron-forward" size={20} color={t.colors.text} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(teacher)/bugun/hafta")}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}
      >
        <Icon name="calendar-outline" size={14} color={t.colors.primary} />
        <Text style={[t.typography.caption, { color: t.colors.primary, fontWeight: "600" }]}>Haftalık görünüm</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Telafilerim"
        hitSlop={8}
        onPress={() => router.push("/(teacher)/telafi")}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, minHeight: 32 }}
      >
        <Icon name="swap-horizontal-outline" size={14} color={t.colors.primary} />
        <Text style={[t.typography.caption, { color: t.colors.primary, fontWeight: "600" }]}>Telafiler</Text>
      </Pressable>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, marginBottom: 4 }}>
        {weekDays.map((day, i) => {
          const selected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, now);
          return (
            <Pressable
              key={day.toISOString()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedDate(day)}
              style={{
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 6,
                borderRadius: 12,
                minWidth: 40,
                backgroundColor: selected ? t.colors.primary : "transparent",
              }}
            >
              <Text
                style={[
                  t.typography.caption,
                  { color: selected ? t.colors.primaryOn : t.colors.textMuted, fontWeight: "600" },
                ]}
              >
                {DAY_LETTERS[i]}
              </Text>
              <Text
                style={[
                  t.typography.bodyStrong,
                  {
                    color: selected ? t.colors.primaryOn : isToday ? t.colors.primary : t.colors.text,
                    marginTop: 2,
                  },
                ]}
              >
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : schedule.status === "error" ? (
        <ErrorState message={schedule.message} onRetry={schedule.refresh} />
      ) : (
        <>
          <SectionHeader title={isSelectedToday ? "Bugünkü dersler" : `${weekdayName(selectedDate)} dersleri`} />
          {selectedDayLessons.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Bu gün için planlanmış ders yok" />
          ) : (
            <View style={{ gap: 10 }}>
              {selectedDayLessons.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  personName={lesson.studentName ?? "Öğrenci"}
                  onPress={() => router.push(`/(teacher)/bugun/${lesson.id}`)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
