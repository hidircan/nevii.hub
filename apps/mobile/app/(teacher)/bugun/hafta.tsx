import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Card, ErrorState, Icon, LessonCard, LoadingSkeleton, Screen } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { addDays, isSameDay, shortDayMonth, startOfDay, startOfWeek, weekdayName } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { ScheduleResponse } from "../../../src/types/api";

/**
 * Haftalık ders programı — "Bugün" sekmesinin tek-gün odağının aksine,
 * web'in /ogretmen/program sayfasıyla aynı bilgi yoğunluğunda tüm haftayı
 * dikey olarak tek ekranda gösterir (bkz. src/app/ogretmen/program/page.tsx).
 * Aynı /schedule uç noktasını kullanır — sunucu tarafında yeni bir şey yok,
 * yalnızca istemci tarafı haftalık gruplama.
 */
export default function HaftalikProgram() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const now = new Date();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const schedule = useApiGet<ScheduleResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/schedule` : "");
  useFocusRefetch(schedule.refresh);

  const lessonsByDay = useMemo(() => {
    if (schedule.status !== "success") return weekDays.map(() => []);
    return weekDays.map((day) =>
      schedule.data.lessons
        .filter((l) => isSameDay(new Date(l.startAt), day))
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
    );
  }, [schedule, weekDays]);

  const weekEnd = weekDays[6]!;
  const weekLabel = `${shortDayMonth(weekStart)} – ${shortDayMonth(weekEnd)}`;

  return (
    <Screen>
      <AppHeader title="Haftalık Program" showBack showNotifications={false} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki hafta"
          hitSlop={8}
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          style={{ padding: 6 }}
        >
          <Icon name="chevron-back" size={20} color={t.colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setWeekStart(startOfWeek(now))} style={{ alignItems: "center" }}>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</Text>
          {!isCurrentWeek ? <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 2 }]}>Bugüne dön</Text> : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki hafta"
          hitSlop={8}
          onPress={() => setWeekStart((w) => addDays(w, 7))}
          style={{ padding: 6 }}
        >
          <Icon name="chevron-forward" size={20} color={t.colors.text} />
        </Pressable>
      </View>

      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={5} />
      ) : schedule.status === "error" ? (
        <ErrorState message={schedule.message} onRetry={schedule.refresh} />
      ) : (
        <View style={{ gap: 14 }}>
          {weekDays.map((day, i) => {
            const today = isSameDay(day, startOfDay(now));
            const dayLessons = lessonsByDay[i]!;
            return (
              <View key={day.toISOString()}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Text style={[t.typography.sectionTitle, { color: today ? t.colors.primary : t.colors.text }]}>
                    {weekdayName(day)}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{shortDayMonth(day)}</Text>
                  {today ? (
                    <View style={{ backgroundColor: t.colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={[t.typography.caption, { color: t.colors.primaryStrong, fontWeight: "700" }]}>Bugün</Text>
                    </View>
                  ) : null}
                </View>
                {dayLessons.length === 0 ? (
                  <Card style={{ opacity: 0.7 }}>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Bu gün ders yok.</Text>
                  </Card>
                ) : (
                  <View style={{ gap: 8 }}>
                    {dayLessons.map((lesson) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        personName={lesson.studentName ?? "Öğrenci"}
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
    </Screen>
  );
}
