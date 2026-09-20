import { useRouter } from "expo-router";
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
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { useApiGet } from "../../hooks/use-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { useTheme } from "../../theme/theme-context";
import type { AttendanceLedgerResponse, StudentProfile } from "../../types/api";
import { AttendanceCounters } from "../student-scope/attendance-counters";
import { attendanceA11yLabel, toAttendanceViewFromLedger } from "./attendance-summary";

/**
 * Veli "Yoklama özeti" ekranı — salt-okunur.
 *
 * Sayılar ledger'dan (limit=1 — yalnız counts gerekir); her sayaç filtreli
 * devam raporunu açar. Veliye yoklama alma/düzenleme/devamsızlık bildirimi
 * aksiyonu VERİLMEZ. Öğrenci bağlamı (`ctx.studentId`) auth'tan gelir,
 * URL'de tahmin edilmez.
 */
export function ParentAttendanceScreen() {
  const t = useTheme();
  const router = useRouter();
  const studentId = useSelectedStudentId();

  const profile = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const res = useApiGet<AttendanceLedgerResponse>(studentId ? `/api/v1/students/${studentId}/attendance-ledger?limit=1` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

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
  const view = res.status === "success" ? toAttendanceViewFromLedger(res.data) : null;

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
          <Card onPress={() => router.push("/(parent)/devam-raporu")}>
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
              {view.attended}/{view.total} derse katıldı · Ayrıntılı raporu gör
            </Text>
          </Card>

          <SectionHeader title="Detay" />
          <AttendanceCounters
            counts={res.data.counts}
            onOpen={(status) => router.push(`/(parent)/devam-raporu?status=${status}`)}
          />

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
