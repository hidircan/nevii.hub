import { Text, View } from "react-native";
import { portalErrorMessage } from "../../components/mobile-ui/api-error-message";
import { useSelectedStudentId } from "../../student/student-context";
import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ProgressBar,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { useTheme } from "../../theme/theme-context";
import type { AttendanceSummary, StudentProfile } from "../../types/api";
import { attendanceA11yLabel, toAttendanceView } from "./attendance-summary";

/**
 * Veli "Yoklama özeti" ekranı — salt-okunur.
 *
 * Yalnız backend'in döndürdüğü `attendance-summary` sayıları gösterilir;
 * veliye yoklama alma/düzenleme/devamsızlık bildirimi aksiyonu VERİLMEZ
 * (bildirim akışı öğrencinin kendi ekranındadır). Öğrenci bağlamı
 * (`ctx.studentId`) auth'tan gelir, URL'de tahmin edilmez.
 */
export function ParentAttendanceScreen() {
  const t = useTheme();
  const studentId = useSelectedStudentId();

  const profile = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const res = useApiGet<AttendanceSummary>(studentId ? `/api/v1/students/${studentId}/attendance-summary` : "");
  useFocusRefetch(res.refresh);

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title="Yoklama özeti" />
        <EmptyState
          icon="alert-circle-outline"
          title="Öğrenci bilgisi bulunamadı"
          description="Bu hesapta görüntülenebilir bir öğrenci kaydı bağlı değil."
        />
      </Screen>
    );
  }

  // Profil adı yoksa yanlış isim gösterilmez — bağlam metni yalnız ad
  // gerçekten geldiğinde kurulur.
  const studentName = profile.status === "success" && profile.data.name ? profile.data.name : undefined;
  const view = res.status === "success" ? toAttendanceView(res.data) : null;

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Yoklama özeti" subtitle={studentName ? `${studentName} — devam durumu` : "Devam durumu"} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={portalErrorMessage(res.code, res.message)} onRetry={res.refresh} code={res.code} />
      ) : !view || !view.hasRecords ? (
        <EmptyState
          icon="calendar-outline"
          title="Henüz işlenmiş ders yok"
          description="Dersler işlendikçe devam durumu burada görünecek."
        />
      ) : (
        <>
          <Card>
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={attendanceA11yLabel(view)}
              style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}
            >
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Katılım oranı</Text>
              <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>%{Math.round(view.rate)}</Text>
            </View>
            <ProgressBar progress={view.rate} tone="success" />
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 8 }]}>
              {view.attended}/{view.total} derse katıldı
            </Text>
          </Card>

          <SectionHeader title="Detay" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.success }]} numberOfLines={1}>
                {view.attended}
              </Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Katıldı</Text>
            </Card>
            <Card style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.danger }]} numberOfLines={1}>
                {view.absent}
              </Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Gelmedi</Text>
            </Card>
            <Card style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.info }]} numberOfLines={1}>
                {view.excused}
              </Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>İzinli</Text>
            </Card>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Card style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.text }]} numberOfLines={1}>
                {view.makeup}
              </Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Telafi</Text>
            </Card>
            <Card style={{ flex: 1, minWidth: 0 }}>
              <Text style={[t.typography.screenTitle, { color: t.colors.text }]} numberOfLines={1}>
                {view.pending}
              </Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Bekleyen</Text>
            </Card>
            <View style={{ flex: 1 }} />
          </View>

          <Card style={{ marginTop: 12 }}>
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
              Devam kayıtları kurum tarafından işlenir. Bir derste değişiklik gerektiğini düşünüyorsanız lütfen
              kurumunuzla iletişime geçin.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}
