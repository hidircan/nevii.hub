import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../../auth/auth-context";
import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LessonCard,
  LoadingSkeleton,
  NotificationCard,
  ProgressBar,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { format, formatCurrency, relativeDayLabel } from "../../lib/date";
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
  const { user } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const studentId = user?.studentId;

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
    const now = Date.now();
    return schedule.data.lessons.filter((l) => new Date(l.startAt).getTime() >= now).sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null;
  }, [schedule]);

  const thisWeekLessons = useMemo(() => {
    if (schedule.status !== "success") return [];
    const now = Date.now();
    const weekAhead = now + 7 * 86400000;
    return schedule.data.lessons.filter((l) => {
      const ts = new Date(l.startAt).getTime();
      return ts >= now && ts <= weekAhead;
    });
  }, [schedule]);

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

  return (
    <Screen onRefresh={schedule.refresh} refreshing={schedule.status === "loading"}>
      <AppHeader title="Nevii Hub" subtitle={headerContext} />

      <SectionHeader title="Sıradaki ders" />
      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : schedule.status === "error" ? (
        <ErrorState message={schedule.message} onRetry={schedule.refresh} />
      ) : nextLesson ? (
        <LessonCard lesson={nextLesson} personName={nextLesson.teacherName ?? "Öğretmen"} onPress={() => router.push(`${basePath}/dersler/${nextLesson.id}`)} />
      ) : (
        <EmptyState icon="calendar-outline" title="Planlanmış ders yok" />
      )}

      <SectionHeader title="Bu haftanın dersleri" actionLabel="Tümü" onAction={() => router.push(`${basePath}/dersler`)} />
      {thisWeekLessons.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Bu hafta ders yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {thisWeekLessons.slice(0, 3).map((l) => (
            <LessonCard key={l.id} lesson={l} personName={l.teacherName ?? "Öğretmen"} onPress={() => router.push(`${basePath}/dersler/${l.id}`)} />
          ))}
        </View>
      )}

      <SectionHeader title="Bekleyen ödevler" actionLabel="Tümü" onAction={() => router.push(`${basePath}/odevler`)} />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : pendingHomework.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="Bekleyen ödev yok" />
      ) : (
        <Card>
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{pendingHomework.length} bekleyen ödev</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
            {pendingHomework.map((h) => h.title).join(", ")}
          </Text>
        </Card>
      )}

      <SectionHeader title="Devam durumu" />
      {attendance.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : attendance.status === "error" ? (
        <ErrorState message={attendance.message} onRetry={attendance.refresh} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>
              {attendance.data.attended}/{attendance.data.totalLessons} derse katıldı
            </Text>
          </View>
          <ProgressBar
            progress={attendance.data.totalLessons ? (attendance.data.attended / attendance.data.totalLessons) * 100 : 0}
            tone="success"
          />
        </Card>
      )}

      {openMakeups.length > 0 ? (
        <>
          <SectionHeader title="Telafi hakları" />
          <View style={{ gap: 8 }}>
            {openMakeups.slice(0, 3).map((m) => (
              <Card key={m.id}>
                <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{m.teacherName ?? "Öğretmen"} — {m.instrument}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                  {m.status === "confirmed" ? "Telafi dersi planlandı" : "Yönetici tarafından değerlendiriliyor"}
                </Text>
              </Card>
            ))}
          </View>
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
      {latestNotifications.length === 0 ? (
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
