import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiDelete, apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Avatar, Button, Card, EmptyState, ErrorState, Icon, LessonCard, LoadingSkeleton, Screen, StatusBadge, TextField } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { addDays, format, isSameDay, shortDayMonth, startOfDay, startOfWeek } from "../../lib/date";
import { lessonStatusBadge } from "../../lib/lesson-status";
import { useTheme } from "../../theme/theme-context";
import type { AbsenceNoticesResponse, AttendanceCalendarMonthResponse, ScheduleResponse, StudentProfile } from "../../types/api";

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
  const { user } = useAuth();
  const router = useRouter();
  const now = new Date();
  const today = startOfDay(now);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const profile = useApiGet<StudentProfile>(user?.studentId ? `/api/v1/students/${user.studentId}` : "");
  const res = useApiGet<ScheduleResponse>(
    user?.studentId
      ? `/api/v1/students/${user.studentId}/schedule?from=${weekStart.toISOString()}&to=${weekEndExclusive.toISOString()}`
      : ""
  );
  const calendar = useApiGet<AttendanceCalendarMonthResponse>(
    user?.studentId
      ? `/api/v1/attendance-calendar/month?studentId=${user.studentId}&year=${weekStart.getFullYear()}&month=${weekStart.getMonth() + 1}`
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
      <AppHeader title="Program" subtitle={studentName ? `${studentName} — haftalık ders programı` : "Haftalık ders programı"} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki hafta" hitSlop={8} onPress={() => setWeekStart((d) => addDays(d, -7))} style={{ padding: 6 }}>
          <Icon name="chevron-back" size={20} color={t.colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</Text>
          {!isCurrentWeek ? (
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(startOfWeek(now))} hitSlop={6} style={{ marginTop: 4 }}>
              <Text style={[t.typography.caption, { color: t.colors.primary, fontWeight: "700" }]}>Bu haftaya dön</Text>
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
                      <LessonCard key={l.id} lesson={l} personName={l.teacherName ?? "Öğretmen"} onPress={() => router.push(`${basePath}/dersler/${l.id}`)} />
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

function AbsenceNoticeSection({ lessonId, studentId }: { lessonId: string; studentId: string }) {
  const t = useTheme();
  const res = useApiGet<AbsenceNoticesResponse>(`/api/v1/absence-notices?studentId=${studentId}`);
  useFocusRefetch(res.refresh);
  const [composing, setComposing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (res.status !== "success") return null;
  const activeNotice = res.data.notices.find((n) => n.lessonId === lessonId && (n.status === "pending" || n.status === "approved"));

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await apiPost<{ noticeId: string }>("/api/v1/absence-notices", { lessonId, reason: reason.trim() || undefined });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setComposing(false);
    setReason("");
    res.refresh();
  }

  async function cancel(noticeId: string) {
    setBusy(true);
    setError(null);
    const result = await apiDelete(`/api/v1/absence-notices/${noticeId}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    res.refresh();
  }

  if (activeNotice) {
    return (
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Devamsızlık bildirimi</Text>
          <StatusBadge
            label={activeNotice.status === "approved" ? "Onaylandı" : "Bekliyor"}
            tone={activeNotice.status === "approved" ? "success" : "warning"}
          />
        </View>
        {activeNotice.reason ? (
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Gerekçe: {activeNotice.reason}</Text>
        ) : null}
        {activeNotice.status === "pending" ? (
          <Button label="Bildirimi iptal et" variant="secondary" size="sm" onPress={() => cancel(activeNotice.id)} loading={busy} style={{ marginTop: 10 }} fullWidth={false} />
        ) : null}
        {error ? <Text style={{ color: t.colors.danger, marginTop: 8 }}>{error}</Text> : null}
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={[t.typography.bodyStrong, { color: t.colors.text, marginBottom: 4 }]}>Bu derse katılamayacak mısınız?</Text>
      <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 10 }]}>
        En az {res.data.policy.minNoticeDays} gün önceden bildirin. Bu dönem için {res.data.policy.maxNoticesPerPeriod} hakkınız var.
      </Text>
      {composing ? (
        <View style={{ gap: 10 }}>
          <TextField label="Gerekçe (isteğe bağlı)" value={reason} onChangeText={setReason} placeholder="Ör. Sağlık nedeniyle" />
          {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setComposing(false)} style={{ flex: 1 }} />
            <Button label="Bildir" size="sm" onPress={submit} loading={busy} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button label="Devam edemeyeceğim" variant="secondary" icon="calendar-clear-outline" onPress={() => setComposing(true)} fullWidth={false} />
      )}
    </Card>
  );
}

export function StudentScopeLessonDetailScreen({ lessonId }: { lessonId: string }) {
  const t = useTheme();
  const { user } = useAuth();
  const res = useApiGet<ScheduleResponse>(user?.studentId ? `/api/v1/students/${user.studentId}/schedule` : "");

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <ErrorState message={friendlyAccessMessage(res.code, res.message)} onRetry={res.refresh} />
      </Screen>
    );
  }

  const lesson = res.data.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title="Ders bulunamadı" />
      </Screen>
    );
  }

  const badge = lessonStatusBadge(lesson);

  return (
    <Screen>
      <AppHeader title={lesson.teacherName ?? "Öğretmen"} showBack showNotifications={false} />

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

      {user?.studentId && new Date(lesson.startAt).getTime() > Date.now() ? (
        <AbsenceNoticeSection lessonId={lesson.id} studentId={user.studentId} />
      ) : null}
    </Screen>
  );
}
