import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Avatar, AttendanceStatusBadge, Button, Card, EmptyState, ErrorState, HomeworkCard, Icon, LiveLessonTimer, LoadingSkeleton, Screen, SectionHeader, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useNow } from "../../../src/hooks/use-now";
import { useAppForegroundRefetch } from "../../../src/hooks/use-app-foreground-refetch";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { format, isPast } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { HomeworkResponse, ScheduleResponse } from "../../../src/types/api";

export default function LessonDetailScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const now = useNow();

  // Salt-okunur ders detayı: öğretmen yalnız kendi programını görüntüler.
  // Yoklama, ders başlatma/bitirme bu yüzeyde YOK — mutasyonlar yalnız
  // yönetici akışındadır. Reddedilecek aksiyona götürmek yerine buton
  // hiç gösterilmez, yerine net bilgi metni konur. Yoklama STATÜSÜ ise
  // salt-okunur rozet olarak gösterilir (yöneticiyle aynı renk/eşleme).
  // Ders yalnız öğretmenin KENDİ programından bulunur (sunucu teacherId sahipliğini doğrular);
  // listede yoksa "bulunamadı" gösterilir — başka bir kaynaktan tahmin edilmez.
  // Detay tek dersi ID ile bulur — kesilme payı için üst sınırla çekilir.
  const schedule = useApiGet<ScheduleResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/schedule?limit=2000` : "");
  useFocusRefetch(schedule.autoRefresh);
  useAppForegroundRefetch(schedule.autoRefresh);
  const lesson = schedule.status === "success" ? schedule.data.lessons.find((l) => l.id === lessonId) : undefined;

  const homework = useApiGet<HomeworkResponse>(lesson?.studentId ? `/api/v1/students/${lesson.studentId}/homework` : "");

  if (schedule.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("lessons.lessonTitle")} showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (schedule.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("lessons.lessonTitle")} showBack showNotifications={false} />
        <ErrorState message={schedule.message} onRetry={schedule.refresh} code={schedule.code} />
      </Screen>
    );
  }
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title={tr("lessons.lessonTitle")} showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("teach.lessonMissing")} description={tr("teach.lessonMissingBody")} />
      </Screen>
    );
  }

  const past = isPast(lesson.endAt, now);
  return (
    <Screen onRefresh={schedule.refresh} refreshing={false}>
      <AppHeader title={lesson.studentName ?? tr("teach.studentFallback")} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={lesson.studentName ?? "?"} size={48} />
          <View style={{ flex: 1 }}>
            <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.studentName ?? tr("teach.studentFallback")}</AppText>
            <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {format(new Date(lesson.startAt), "HH:mm")}–{format(new Date(lesson.endAt), "HH:mm")}
              {lesson.instrument ? ` · ${lesson.instrument}` : ""}
              {lesson.roomName ? ` · ${lesson.roomName}` : ""}
            </AppText>
          </View>
          <AttendanceStatusBadge lesson={lesson} size="md" />
        </View>
      </Card>


      {/* Canlı süre sayacı: yalnız görüntüleme (yoklama/başlat/bitir yalnız yöneticide — sunucu da TEACHER isteğini reddeder). */}
      {!past && lesson.status === "in_progress" && lesson.actualStartAt ? (
        <Card style={{ marginTop: 12 }}>
          <LiveLessonTimer actualStartAt={lesson.actualStartAt} scheduledEndAt={lesson.endAt} />
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12 }}>
        <Icon name="information-circle-outline" size={16} color={t.colors.textMuted} />
        <AppText style={[t.typography.caption, { color: t.colors.textMuted, flex: 1 }]}>
          {tr("teach.attendanceAdminOnly")}
        </AppText>
      </View>

      <SectionHeader title={tr("teach.actions")} />
      <View style={{ gap: 8 }}>
        <Button
          label={tr("teach.giveHomework")}
          icon="add-circle-outline"
          onPress={() =>
            router.push(
              `/(teacher)/odevler/yeni?studentId=${lesson.studentId}&studentName=${encodeURIComponent(lesson.studentName ?? "")}`
            )
          }
        />
        <Button
          label={tr("teach.addAssessment")}
          variant="secondary"
          icon="school-outline"
          onPress={() =>
            router.push(
              `/assessment/${lesson.id}?studentId=${lesson.studentId}&studentName=${encodeURIComponent(lesson.studentName ?? "")}`
            )
          }
        />
      </View>

      <SectionHeader title={tr("teach.pastHomework")} />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : homework.status === "error" ? (
        <ErrorState message={homework.message} onRetry={homework.refresh} code={homework.code} />
      ) : homework.data.homework.length === 0 ? (
        <EmptyState icon="book-outline" title={tr("teach.noHomeworkYet")} />
      ) : (
        <View style={{ gap: 10 }}>
          {homework.data.homework.slice(0, 5).map((h) => (
            <HomeworkCard key={h.id} homework={h} showStudentName={false} />
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
        <Icon name="information-circle-outline" size={14} color={t.colors.textFaint} />
        <AppText style={[t.typography.caption, { color: t.colors.textFaint }]}>
          {tr("teach.contactNote")}
        </AppText>
      </View>

    </Screen>
  );
}
