import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, AttendanceLegend, Card, EmptyState, ErrorState, Icon, LessonCard, LoadingSkeleton, Screen, SectionHeader, AppText } from "../../../src/components/ui";
import { useAppForegroundRefetch } from "../../../src/hooks/use-app-foreground-refetch";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { addDays, format, formatCurrency, isSameDay, shortDayMonth, startOfDay, startOfWeek, weekdayName } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkResponse, PayoutsResponse, ScheduleResponse } from "../../../src/types/api";

/**
 * Öğretmen ana ekranı — ayrıntılı HAFTALIK DERS PROGRAMI (varsayılan görünüm).
 *
 * Ürün kuralları:
 * - Kapanış-bekleyen alanı YOK (öğretmen yoklama almaz, ders
 *   başlatmaz/bitirmez).
 * - Yoklama durumu SALT OKUNUR rozet olarak gösterilir (`showAttendance`) —
 *   yöneticiyle AYNI renk/eşleme (features/attendance/status-style). Öğretmen
 *   yoklama ALAMAZ: CTA/mutasyon yoktur (bkz. teacher-no-attendance testi).
 * - Kartlarda şube adı + oda bilgisi gösterilir.
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

  // Haftalık görünüm yalnız görünen haftayı çeker (sınırsız tüm-geçmiş yerine).
  const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const schedule = useApiGet<ScheduleResponse>(
    user?.teacherId
      ? `/api/v1/teachers/${user.teacherId}/schedule?from=${weekStart.toISOString()}&to=${weekEndExclusive.toISOString()}`
      : ""
  );
  const homework = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  // Kompakt "Ödev & Hakediş" özeti — içerik akışında, sabit alt bölgede DEĞİL.
  const payouts = useApiGet<PayoutsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/payouts` : "");
  function refreshAll() {
    schedule.refresh();
    homework.refresh();
    payouts.refresh();
  }
  function refreshAllAuto() {
    schedule.autoRefresh();
    homework.autoRefresh();
    payouts.autoRefresh();
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

  // Ödev & hakediş özeti — veri gelmezse satır "—" gösterir (yanlış "0" yok).
  const pendingHomeworkCount =
    homework.status === "success" ? homework.data.homework.filter((h) => h.status === "PENDING").length : null;
  const pendingPayouts =
    payouts.status === "success" ? payouts.data.payouts.filter((p) => p.status === "pending") : null;
  const pendingPayoutTotal = pendingPayouts?.reduce((sum, p) => sum + p.totalAmount, 0) ?? null;

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
          <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]}>{weekLabel}</AppText>
          {!isCurrentWeek ? (
            <AppText style={[t.typography.caption, { color: t.colors.primary, marginTop: 2 }]}>{tr("lessons.backToWeek")}</AppText>
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

      <AttendanceLegend />

      <AppText
        style={[
          t.typography.compactTitle,
          { color: t.colors.text, marginTop: 24, marginBottom: 12 },
        ]}
      >
        {tr("teach.summaryTitle")}
      </AppText>
      <Card style={{ paddingVertical: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tr("teach.pendingHomework")}: ${pendingHomeworkCount ?? "—"}`}
          onPress={() => router.push("/(teacher)/odevler")}
          style={styles.summaryRow}
        >
          <View style={styles.summaryLeft}>
            <Icon name="book-outline" size={16} color={t.colors.textMuted} />
            <AppText style={[t.typography.compactBody, { color: t.colors.text }]} numberOfLines={1}>
              {tr("teach.pendingHomework")}
            </AppText>
          </View>
          <AppText
            numberOfLines={1}
            style={[
              t.typography.compactBody,
              {
                fontFamily: t.fonts.semibold,
                color: pendingHomeworkCount && pendingHomeworkCount > 0 ? t.colors.warning : t.colors.textMuted,
              },
            ]}
          >
            {pendingHomeworkCount === null ? "—" : pendingHomeworkCount > 0 ? String(pendingHomeworkCount) : tr("teach.summaryNone")}
          </AppText>
          <Icon name="chevron-forward" size={14} color={t.colors.textFaint} />
        </Pressable>
        <View style={[styles.summaryDivider, { backgroundColor: t.colors.divider }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tr("teach.pendingPayout")}: ${pendingPayoutTotal === null ? "—" : formatCurrency(pendingPayoutTotal)}`}
          onPress={() => router.push("/(teacher)/hakedis")}
          style={styles.summaryRow}
        >
          <View style={styles.summaryLeft}>
            <Icon name="cash-outline" size={16} color={t.colors.textMuted} />
            <AppText style={[t.typography.compactBody, { color: t.colors.text }]} numberOfLines={1}>
              {tr("teach.pendingPayout")}
            </AppText>
          </View>
          <AppText
            numberOfLines={1}
            style={[
              t.typography.compactBody,
              {
                fontFamily: t.fonts.semibold,
                color: pendingPayoutTotal && pendingPayoutTotal > 0 ? t.colors.text : t.colors.textMuted,
              },
            ]}
          >
            {pendingPayoutTotal === null ? "—" : pendingPayoutTotal > 0 ? formatCurrency(pendingPayoutTotal) : tr("teach.summaryNone")}
          </AppText>
          <Icon name="chevron-forward" size={14} color={t.colors.textFaint} />
        </Pressable>
      </Card>

      {studentsWithoutTodayHomework.length > 0 ? (
        <Card style={{ borderColor: t.colors.warning, backgroundColor: t.colors.warningSoft }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Icon name="alert-circle" size={18} color={t.colors.warning} />
            <View style={{ flex: 1 }}>
              <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("teach.noHomeworkTitle")}</AppText>
              <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                {tr("teach.noHomeworkBody", { names: studentsWithoutTodayHomework.map((n) => n ?? tr("teach.studentFallback")).join(", ") })}
              </AppText>
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
                  <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>{tr("teach.closedDay")}</AppText>
                ) : lessons.length === 0 ? (
                  <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>{tr("teach.noPlannedDay")}</AppText>
                ) : (
                  <View style={{ gap: 10 }}>
                    {lessons.map((lesson) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        showAttendance
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
        <AppText style={[t.typography.bodyStrong, { color: t.colors.primary }]}>{tr("teach.makeups")}</AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /**
   * Kompakt özet satırı — etiket solda, değer sağda; ikon+metin dikey
   * ortalı, iki satır EŞİT yükseklikte (minHeight 44 → dokunma hedefi).
   */
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 44,
    paddingVertical: 8,
  },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  summaryDivider: { height: StyleSheet.hairlineWidth },
});
