import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { ChildSwitcher } from "../../student/child-switcher";
import { useSelectedStudentId } from "../../student/student-context";
import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LessonCard,
  ListGroup,
  ListRow,
  LoadingSkeleton,
  NotificationCard,
  ProgressBar,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { useApiGet } from "../../hooks/use-api";
import { useNow } from "../../hooks/use-now";
import { format, formatCurrency, isPast, relativeDayLabel, weekdayName } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import type {
  AssessmentsResponse,
  AttendanceSummary,
  BalanceResponse,
  HomeworkResponse,
  MakeupResponse,
  NotificationsResponse,
  ScheduleResponse,
  StudentProfile,
} from "../../types/api";

/**
 * Veli ve öğrenci "Ana Sayfa" ekranı — ikisi de aynı öğrenci-scoped veriye
 * (ctx.studentId) bakar, farkı yalnızca hangi sekme grubu altında açıldığı
 * (basePath). Bilgi mimarisi (sekme yerleşimi) ayrı kalsın diye route
 * dosyaları ayrı, ama iş mantığı/bileşen burada paylaşılıyor.
 */
export function StudentScopeHomeScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const router = useRouter();
  const now = useNow();
  // Aktif öğrenci bağlamı — seçim beklenirken null: ekranlar skeleton gösterir,
  // eski öğrencinin verisi ASLA görünmez (URL'ler seçili ID'den kurulur).
  const studentId = useSelectedStudentId();

  const profile = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const schedule = useApiGet<ScheduleResponse>(studentId ? `/api/v1/students/${studentId}/schedule` : "");
  const homework = useApiGet<HomeworkResponse>(studentId ? `/api/v1/students/${studentId}/homework` : "");
  const attendance = useApiGet<AttendanceSummary>(studentId ? `/api/v1/students/${studentId}/attendance-summary` : "");
  const assessments = useApiGet<AssessmentsResponse>(studentId ? `/api/v1/assessments/${studentId}` : "");
  const notifications = useApiGet<NotificationsResponse>("/api/v1/notifications");
  const makeup = useApiGet<MakeupResponse>(studentId ? "/api/v1/makeup" : "");
  // Öğrenci de kendi ödeme geçmişini görebilmeli (Bölüm D) — yalnızca veliye
  // özel değil, bkz. getParentBalanceTool'daki STUDENT genişletmesi.
  const balance = useApiGet<BalanceResponse>(studentId ? `/api/v1/students/${studentId}/balance` : "");

  const nextLesson = useMemo(() => {
    if (schedule.status !== "success") return null;
    return schedule.data.lessons.filter((l) => !isPast(l.startAt, now)).sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null;
  }, [schedule, now]);

  const thisWeekLessons = useMemo(() => {
    if (schedule.status !== "success") return [];
    const weekAhead = now + 7 * 86400000;
    return schedule.data.lessons.filter((l) => {
      const ts = new Date(l.startAt).getTime();
      return ts >= now && ts <= weekAhead;
    });
  }, [schedule, now]);

  const pendingHomework = homework.status === "success" ? homework.data.homework.filter((h) => h.status !== "REVIEWED") : [];
  const latestAssessment = assessments.status === "success" ? assessments.data.assessments[assessments.data.assessments.length - 1] : null;
  const latestNotifications = notifications.status === "success" ? notifications.data.notifications.slice(0, 3) : [];
  const openMakeups =
    makeup.status === "success"
      ? makeup.data.makeupRequests.filter((m) => !["completed", "expired", "cancelled"].includes(m.status))
      : [];

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title="Ana Sayfa" />
        <EmptyState icon="alert-circle-outline" title="Öğrenci bilgisi bulunamadı" description="Bu hesapta bir öğrenci kaydı bağlı değil." />
      </Screen>
    );
  }

  // Jenerik "Merhaba" selamlaması yerine marka + gerçek bağlam (sıradaki
  // ders varsa saati, yoksa yalnızca öğrenci adı — asla dolgu cümle).
  const headerContext =
    profile.status === "success"
      ? nextLesson
        ? `${profile.data.name} · sıradaki ders ${format(new Date(nextLesson.startAt), "HH:mm")}`
        : profile.data.name
      : undefined;

  const refreshing =
    schedule.status === "loading" ||
    profile.status === "loading" ||
    homework.status === "loading" ||
    notifications.status === "loading";
  function refreshAll() {
    schedule.refresh();
    profile.refresh();
    homework.refresh();
    attendance.refresh();
    assessments.refresh();
    notifications.refresh();
    makeup.refresh();
    balance.refresh();
  }
  // Web'de admin değişikliği → foreground'a dönüşte yeniden doğrula.
  useAppForegroundRefetch(refreshAll);

  return (
    <Screen onRefresh={refreshAll} refreshing={refreshing}>
      <AppHeader title="Nevii Hub" subtitle={headerContext} showAccount={`${basePath}/hesabim`} />
      <ChildSwitcher childName={profile.status === "success" ? profile.data.name : undefined} />

      <SectionHeader title="Sıradaki ders" />
      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : schedule.status === "error" ? (
        <ErrorState message={schedule.message} onRetry={schedule.refresh} />
      ) : nextLesson ? (
        <LessonCard lesson={nextLesson} studentFacing personName={nextLesson.teacherName ?? "Öğretmen"} onPress={() => router.push(`${basePath}/dersler/${nextLesson.id}`)} />
      ) : (
        <EmptyState icon="calendar-outline" title="Planlanmış ders yok" />
      )}

      <SectionHeader title="Bu haftanın dersleri" actionLabel="Tümü" onAction={() => router.push(`${basePath}/dersler`)} />
      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : schedule.status === "error" ? (
        <ErrorState message={schedule.message} onRetry={schedule.refresh} />
      ) : thisWeekLessons.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Bu hafta ders yok" />
      ) : (
        <ListGroup>
          {thisWeekLessons.slice(0, 3).map((l) => {
            const day = weekdayName(new Date(l.startAt));
            const time = format(new Date(l.startAt), "HH:mm");
            return (
              <ListRow
                key={l.id}
                icon="calendar-outline"
                title={l.teacherName ?? "Öğretmen"}
                subtitle={`${day} ${time}${l.instrument ? ` · ${l.instrument}` : ""}${l.roomName ? ` · ${l.roomName}` : ""}`}
                onPress={() => router.push(`${basePath}/dersler/${l.id}`)}
              />
            );
          })}
        </ListGroup>
      )}

      <SectionHeader title="Bekleyen ödevler" actionLabel="Tümü" onAction={() => router.push(`${basePath}/odevler`)} />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : homework.status === "error" ? (
        <ErrorState message={homework.message} onRetry={homework.refresh} />
      ) : pendingHomework.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="Bekleyen ödev yok" />
      ) : (
        <ListGroup>
          <ListRow
            icon="book-outline"
            title={`${pendingHomework.length} bekleyen ödev`}
            subtitle={pendingHomework.map((h) => h.title).join(", ")}
            onPress={() => router.push(`${basePath}/odevler`)}
          />
        </ListGroup>
      )}

      <SectionHeader title="Devam durumu" />
      {attendance.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : attendance.status === "error" ? (
        <ErrorState message={attendance.message} onRetry={attendance.refresh} />
      ) : (
        <Card onPress={() => router.push(`${basePath}/devam-raporu`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>
              {attendance.data.attended}/{attendance.data.totalLessons} derse katıldı
            </Text>
            <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
          </View>
          <ProgressBar
            progress={attendance.data.totalLessons ? (attendance.data.attended / attendance.data.totalLessons) * 100 : 0}
            tone="success"
          />
          <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 8 }]}>Ayrıntılı raporu gör</Text>
        </Card>
      )}

      {openMakeups.length > 0 ? (
        <>
          <SectionHeader title="Telafi hakları" />
          <ListGroup>
            {openMakeups.slice(0, 3).map((m) => (
              <ListRow
                key={m.id}
                icon="swap-horizontal-outline"
                title={`${m.teacherName ?? "Öğretmen"}${m.instrument ? ` — ${m.instrument}` : ""}`}
                subtitle={m.status === "confirmed" ? "Telafi dersi planlandı" : "Yönetici tarafından değerlendiriliyor"}
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      <SectionHeader title="Ödeme özeti" />
      {balance.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : balance.status === "error" ? (
        <ErrorState message={balance.message} onRetry={balance.refresh} />
      ) : (
        <Card onPress={() => router.push(`${basePath}/odemeler`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[t.typography.body, { color: t.colors.text }]}>Bekleyen bakiye</Text>
            <Text style={[t.typography.cardTitle, { color: balance.data.outstanding > 0 ? t.colors.danger : t.colors.success }]}>
              {formatCurrency(balance.data.outstanding)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
            <Text style={[t.typography.caption, { color: t.colors.primary }]}>Tüm ödemeleri gör</Text>
            <Icon name="chevron-forward" size={13} color={t.colors.primary} />
          </View>
        </Card>
      )}

      <SectionHeader title="Öğretmen notu" />
      {assessments.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : assessments.status === "error" ? (
        <ErrorState message={assessments.message} onRetry={assessments.refresh} />
      ) : latestAssessment ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon name="chatbubble-ellipses-outline" size={16} color={t.colors.primary} />
            <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(latestAssessment.createdAt))}</Text>
          </View>
          <Text style={[t.typography.body, { color: t.colors.text }]}>{latestAssessment.strengthNote}</Text>
        </Card>
      ) : (
        <EmptyState icon="chatbubble-outline" title="Henüz öğretmen notu yok" />
      )}

      <SectionHeader title="Bildirimler" actionLabel="Tümü" onAction={() => router.push("/notifications")} />
      {notifications.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : notifications.status === "error" ? (
        <ErrorState message={notifications.message} onRetry={notifications.refresh} />
      ) : latestNotifications.length === 0 ? (
        <EmptyState icon="notifications-outline" title="Bildirim yok" />
      ) : (
        <View style={{ gap: 8 }}>
          {latestNotifications.map((n) => (
            <NotificationCard key={n.id} notification={n} onPress={() => router.push("/notifications")} />
          ))}
        </View>
      )}
    </Screen>
  );
}
