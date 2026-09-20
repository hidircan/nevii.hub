import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { apiPost } from "../../../../src/api/client";
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  HomeworkCard,
  LoadingSkeleton,
  Screen,
  ProgressBar,
  SectionHeader,
  SelectField,
  StatusBadge,
  TextField,
} from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { useNow } from "../../../../src/hooks/use-now";
import { formatCurrency, isPast, shortDayMonth } from "../../../../src/lib/date";
import { useTheme } from "../../../../src/theme/theme-context";
import type {
  AttendanceSummary,
  BalanceResponse,
  CurriculumResponse,
  HomeworkResponse,
  PortalAccessResponse,
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

const ACCESS_STATUS_LABEL: Record<string, string> = {
  invited: "Davetli",
  active: "Aktif",
  revoked: "İptal edilmiş",
};

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default function AdminStudentDetail() {
  const t = useTheme();
  const now = useNow();
  const { id } = useLocalSearchParams<{ id: string }>();

  const profile = useApiGet<StudentProfile>(`/api/v1/students/${id}`);
  const schedule = useApiGet<ScheduleResponse>(`/api/v1/students/${id}/schedule`);
  const attendance = useApiGet<AttendanceSummary>(`/api/v1/students/${id}/attendance-summary`);
  const curriculum = useApiGet<CurriculumResponse>(`/api/v1/students/${id}/curriculum`);
  const homework = useApiGet<HomeworkResponse>(`/api/v1/students/${id}/homework`);
  const balance = useApiGet<BalanceResponse>(`/api/v1/students/${id}/balance`);
  const documents = useApiGet<StudentDocumentsResponse>(`/api/v1/students/${id}/documents`);
  const consent = useApiGet<SocialMediaConsentResponse>(`/api/v1/students/${id}/social-media-consent`);
  const portalAccess = useApiGet<PortalAccessResponse>(`/api/v1/students/${id}/portal-access`);

  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ userId: string; email: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteType, setInviteType] = useState<string | null>("GUARDIAN");

  async function confirmPayment() {
    if (!confirmingPaymentId) return;
    setActionError(null);
    const res = await apiPost(`/api/v1/payments/${confirmingPaymentId}/pay`, {});
    setConfirmingPaymentId(null);
    if (!res.ok) {
      setActionError(res.error.message || "Ödeme kaydedilemedi.");
      return;
    }
    balance.refresh();
  }

  async function mutateAccess(action: "revoke" | "reactivate", userId: string) {
    setAccessBusy(userId);
    setActionError(null);
    const res = await apiPost(`/api/v1/students/${id}/portal-access/${action}`, { userId });
    setAccessBusy(null);
    if (!res.ok) {
      setActionError(res.error.message || "Erişim güncellenemedi.");
      return;
    }
    portalAccess.refresh();
  }

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!email || !inviteType) return;
    setAccessBusy("invite");
    setActionError(null);
    const res = await apiPost(`/api/v1/students/${id}/portal-access/invite`, { email, accessType: inviteType });
    setAccessBusy(null);
    if (!res.ok) {
      setActionError(res.error.message || "Davet gönderilemedi.");
      return;
    }
    setInviteOpen(false);
    setInviteEmail("");
    portalAccess.refresh();
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
  const upcoming = schedule.status === "success" ? schedule.data.lessons.filter((l) => !isPast(l.startAt, now)).length : null;

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
        <Text
          style={[t.typography.body, { color: t.colors.primary, marginTop: 6 }]}
          onPress={() => void Linking.openURL(telHref(student.parentPhone))}
          accessibilityRole="link"
          accessibilityLabel={`${student.parentPhone} numarasını ara`}
        >
          {student.parentPhone} →
        </Text>
      </Card>

      <SectionHeader title="Portal erişimi" actionLabel={inviteOpen ? undefined : "Davet et"} onAction={inviteOpen ? undefined : () => setInviteOpen(true)} />
      {actionError ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{actionError}</Text>
        </Card>
      ) : null}
      {inviteOpen ? (
        <Card style={{ marginBottom: 10 }}>
          <TextField label="E-posta" value={inviteEmail} onChangeText={setInviteEmail} placeholder="ornek@e-posta.com" keyboardType="email-address" autoCapitalize="none" />
          <View style={{ height: 12 }} />
          <SelectField
            label="Erişim türü"
            value={inviteType}
            placeholder="Seçin"
            options={[
              { label: "Veli (çocuk adına salt-görünüm)", value: "GUARDIAN" },
              { label: "Öğrenci (kendi hesabı)", value: "SELF" },
            ]}
            onChange={setInviteType}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button label="Vazgeç" variant="secondary" style={{ flex: 1 }} onPress={() => setInviteOpen(false)} />
            <Button label="Davet gönder" style={{ flex: 1 }} loading={accessBusy === "invite"} disabled={!inviteEmail.trim() || !inviteType} onPress={sendInvite} />
          </View>
        </Card>
      ) : null}
      {portalAccess.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : portalAccess.status === "error" ? (
        <ErrorState message={portalAccess.message} onRetry={portalAccess.refresh} />
      ) : portalAccess.data.accounts.length === 0 ? (
        <EmptyState icon="key-outline" title="Portal hesabı yok" />
      ) : (
        <View style={{ gap: 8 }}>
          {portalAccess.data.accounts.map((a) => (
            <Card key={a.userId}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.body, { color: t.colors.text }]} numberOfLines={1}>
                    {a.email || "(e-posta yok)"}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    {a.accessType === "GUARDIAN" ? "Veli" : "Öğrenci"}
                  </Text>
                </View>
                <StatusBadge
                  label={ACCESS_STATUS_LABEL[a.status] ?? a.status}
                  tone={a.status === "active" ? "success" : a.status === "invited" ? "warning" : "neutral"}
                />
              </View>
              {a.status === "active" ? (
                <Button
                  label="Erişimi iptal et"
                  size="sm"
                  variant="danger"
                  loading={accessBusy === a.userId}
                  style={{ marginTop: 10 }}
                  onPress={() => setConfirmRevoke({ userId: a.userId, email: a.email })}
                />
              ) : a.status === "revoked" ? (
                <Button
                  label="Erişimi yeniden aç"
                  size="sm"
                  variant="secondary"
                  loading={accessBusy === a.userId}
                  style={{ marginTop: 10 }}
                  onPress={() => void mutateAccess("reactivate", a.userId)}
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={!!confirmingPaymentId}
        title="Ödeme kaydedilsin mi?"
        message="Bu tutar tamamı tahsil edilmiş olarak işaretlenecek."
        confirmLabel="Ödendi işaretle"
        onConfirm={confirmPayment}
        onCancel={() => setConfirmingPaymentId(null)}
      />

      <ConfirmDialog
        visible={!!confirmRevoke}
        title="Portal erişimi iptal edilsin mi?"
        message={confirmRevoke ? `${confirmRevoke.email || "Bu hesap"} artık öğrencinin bilgilerini göremez, push bildirimleri durur.` : undefined}
        confirmLabel="Erişimi iptal et"
        danger
        onConfirm={() => {
          if (!confirmRevoke) return;
          const { userId } = confirmRevoke;
          setConfirmRevoke(null);
          void mutateAccess("revoke", userId);
        }}
        onCancel={() => setConfirmRevoke(null)}
      />
    </Screen>
  );
}
