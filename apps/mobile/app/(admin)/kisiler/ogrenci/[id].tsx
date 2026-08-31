import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../../src/api/client";
import {
  AppHeader,
  Avatar,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  HomeworkCard,
  LoadingSkeleton,
  Screen,
  ProgressBar,
  SectionHeader,
  StatusBadge,
} from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { formatCurrency, shortDayMonth } from "../../../../src/lib/date";
import { useTheme } from "../../../../src/theme/theme-context";
import type {
  AttendanceSummary,
  BalanceResponse,
  CurriculumResponse,
  HomeworkResponse,
  ScheduleResponse,
  SocialMediaConsentResponse,
  StudentDocumentsResponse,
  StudentProfile,
} from "../../../../src/types/api";

const CONSENT_STATUS_LABEL: Record<string, string> = {
  granted: "Onay verildi",
  denied: "Onay verilmedi",
  withdrawn: "Onay geri çekildi",
  expired: "Onay süresi doldu",
};

export default function AdminStudentDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const profile = useApiGet<StudentProfile>(`/api/v1/students/${id}`);
  const schedule = useApiGet<ScheduleResponse>(`/api/v1/students/${id}/schedule`);
  const attendance = useApiGet<AttendanceSummary>(`/api/v1/students/${id}/attendance-summary`);
  const curriculum = useApiGet<CurriculumResponse>(`/api/v1/students/${id}/curriculum`);
  const homework = useApiGet<HomeworkResponse>(`/api/v1/students/${id}/homework`);
  const balance = useApiGet<BalanceResponse>(`/api/v1/students/${id}/balance`);
  const documents = useApiGet<StudentDocumentsResponse>(`/api/v1/students/${id}/documents`);
  const consent = useApiGet<SocialMediaConsentResponse>(`/api/v1/students/${id}/social-media-consent`);

  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  async function confirmPayment() {
    if (!confirmingPaymentId) return;
    setPayBusy(true);
    await apiPost(`/api/v1/payments/${confirmingPaymentId}/pay`, {});
    setPayBusy(false);
    setConfirmingPaymentId(null);
    balance.refresh();
  }

  if (profile.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Öğrenci" showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (profile.status === "error") {
    return (
      <Screen>
        <AppHeader title="Öğrenci" showBack showNotifications={false} />
        <ErrorState message={profile.message} onRetry={profile.refresh} />
      </Screen>
    );
  }

  const student = profile.data;
  const upcoming = schedule.status === "success" ? schedule.data.lessons.filter((l) => new Date(l.startAt).getTime() >= Date.now()).length : null;

  return (
    <Screen>
      <AppHeader title={student.name} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={student.name} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{student.name}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {student.instruments.join(", ")} · Öğretmen: {student.teacherName ?? "—"}
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Program" />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>{upcoming === null ? "Yükleniyor…" : `${upcoming} yaklaşan ders`}</Text>
      </Card>

      <SectionHeader title="Devam durumu" />
      {attendance.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : attendance.status === "error" ? (
        <ErrorState message={attendance.message} onRetry={attendance.refresh} />
      ) : (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.text }]}>
            {attendance.data.attended}/{attendance.data.totalLessons} derse katıldı · {attendance.data.absent} devamsızlık
          </Text>
        </Card>
      )}

      <SectionHeader title="Gelişim / müfredat" />
      {curriculum.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : curriculum.status === "error" ? (
        <ErrorState message={curriculum.message} onRetry={curriculum.refresh} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Genel ilerleme</Text>
            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>%{Math.round(curriculum.data.overallPercent)}</Text>
          </View>
          <ProgressBar progress={curriculum.data.overallPercent} />
        </Card>
      )}

      <SectionHeader title="Ödevler" />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : homework.status === "error" ? (
        <ErrorState message={homework.message} onRetry={homework.refresh} />
      ) : homework.data.homework.length === 0 ? (
        <EmptyState icon="book-outline" title="Henüz ödev yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {homework.data.homework.slice(0, 5).map((h) => (
            <HomeworkCard key={h.id} homework={h} showStudentName={false} />
          ))}
        </View>
      )}

      <SectionHeader title="Ödeme özeti" />
      {balance.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : balance.status === "error" ? (
        <ErrorState message={balance.message} onRetry={balance.refresh} />
      ) : (
        <View style={{ gap: 10 }}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[t.typography.body, { color: t.colors.text }]}>Bekleyen bakiye</Text>
              <Text style={[t.typography.cardTitle, { color: balance.data.outstanding > 0 ? t.colors.danger : t.colors.success }]}>
                {formatCurrency(balance.data.outstanding)}
              </Text>
            </View>
          </Card>
          {balance.data.payments
            .filter((p) => p.status !== "paid")
            .slice(0, 5)
            .map((p) => (
              <Card key={p.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[t.typography.body, { color: t.colors.text, flex: 1 }]}>{p.description}</Text>
                  <StatusBadge label={formatCurrency(p.amount - p.paidAmount)} tone="warning" />
                </View>
                <Text
                  style={[t.typography.caption, { color: t.colors.primary, marginTop: 8 }]}
                  onPress={() => setConfirmingPaymentId(p.id)}
                >
                  Ödendi olarak işaretle →
                </Text>
              </Card>
            ))}
        </View>
      )}

      <SectionHeader title="Evraklar" />
      {documents.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : documents.status === "error" ? (
        <ErrorState message={documents.message} onRetry={documents.refresh} />
      ) : documents.data.documents.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Evrak yok" />
      ) : (
        <View style={{ gap: 8 }}>
          {documents.data.documents.slice(0, 5).map((d) => (
            <Card key={d.id}>
              <Text style={[t.typography.body, { color: t.colors.text }]}>{d.kind} — {d.reference}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{shortDayMonth(new Date(d.createdAt))}</Text>
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title="KVKK / sosyal medya onamı" />
      {consent.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : consent.status === "error" ? (
        <ErrorState message={consent.message} onRetry={consent.refresh} />
      ) : !consent.data.consent ? (
        <EmptyState icon="shield-outline" title="Kayıtlı onam yok" />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[t.typography.body, { color: t.colors.text }]}>{consent.data.consent.representativeName}</Text>
            <StatusBadge
              label={CONSENT_STATUS_LABEL[consent.data.consent.status] ?? consent.data.consent.status}
              tone={consent.data.consent.status === "granted" ? "success" : "neutral"}
            />
          </View>
          {consent.data.consent.scopes.length > 0 ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>Kapsam: {consent.data.consent.scopes.join(", ")}</Text>
          ) : null}
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>{shortDayMonth(new Date(consent.data.consent.grantedAt))}</Text>
        </Card>
      )}

      <SectionHeader title="Veli iletişim" />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>{student.parentName}</Text>
        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{student.parentPhone}</Text>
      </Card>

      <ConfirmDialog
        visible={!!confirmingPaymentId}
        title="Ödeme kaydedilsin mi?"
        message="Bu tutar tamamı tahsil edilmiş olarak işaretlenecek."
        confirmLabel="Ödendi işaretle"
        onConfirm={confirmPayment}
        onCancel={() => setConfirmingPaymentId(null)}
      />
    </Screen>
  );
}
