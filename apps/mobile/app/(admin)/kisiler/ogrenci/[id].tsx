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
import { useLocale } from "../../../../src/i18n/locale-context";
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

const CONSENT_STATUS_KEY: Record<string, string> = {
  granted: "adm.stuConsentGranted",
  denied: "adm.stuConsentDenied",
  withdrawn: "adm.stuConsentWithdrawn",
  expired: "adm.stuConsentExpired",
};

const ACCESS_STATUS_KEY: Record<string, string> = {
  invited: "adm.stuAccInvited",
  active: "adm.stuAccActive",
  revoked: "adm.stuAccRevoked",
};

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default function AdminStudentDetail() {
  const t = useTheme();
  const { t: tr } = useLocale();
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
      setActionError(res.error.message || tr("adm.stuPayFail"));
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
      setActionError(res.error.message || tr("adm.stuAccessFail"));
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
      setActionError(res.error.message || tr("adm.stuInviteFail"));
      return;
    }
    setInviteOpen(false);
    setInviteEmail("");
    portalAccess.refresh();
  }

  if (profile.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("adm.stuTitle")} showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (profile.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("adm.stuTitle")} showBack showNotifications={false} />
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
              {student.instruments.join(", ")} · {tr("adm.stuTeacherLine", { name: student.teacherName ?? "—" })}
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader title={tr("adm.stuProgram")} />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>{upcoming === null ? tr("adm.stuLoading") : tr("adm.stuUpcoming", { n: upcoming })}</Text>
      </Card>

      <SectionHeader title={tr("adm.stuAttendance")} />
      {attendance.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : attendance.status === "error" ? (
        <ErrorState message={attendance.message} onRetry={attendance.refresh} />
      ) : (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.text }]}>
            {tr("adm.stuAttended", { a: attendance.data.attended, t: attendance.data.totalLessons, b: attendance.data.absent })}
          </Text>
        </Card>
      )}

      <SectionHeader title={tr("adm.stuGrowth")} />
      {curriculum.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : curriculum.status === "error" ? (
        <ErrorState message={curriculum.message} onRetry={curriculum.refresh} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("adm.stuOverall")}</Text>
            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>%{Math.round(curriculum.data.overallPercent)}</Text>
          </View>
          <ProgressBar progress={curriculum.data.overallPercent} />
        </Card>
      )}

      <SectionHeader title={tr("adm.stuHw")} />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : homework.status === "error" ? (
        <ErrorState message={homework.message} onRetry={homework.refresh} />
      ) : homework.data.homework.length === 0 ? (
        <EmptyState icon="book-outline" title={tr("adm.stuNoHw")} />
      ) : (
        <View style={{ gap: 10 }}>
          {homework.data.homework.slice(0, 5).map((h) => (
            <HomeworkCard key={h.id} homework={h} showStudentName={false} />
          ))}
        </View>
      )}

      <SectionHeader title={tr("adm.stuPay")} />
      {balance.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : balance.status === "error" ? (
        <ErrorState message={balance.message} onRetry={balance.refresh} />
      ) : (
        <View style={{ gap: 10 }}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[t.typography.body, { color: t.colors.text }]}>{tr("adm.stuOutstanding")}</Text>
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
                  {tr("adm.stuMarkPaid")}
                </Text>
              </Card>
            ))}
        </View>
      )}

      <SectionHeader title={tr("adm.stuDocs")} />
      {documents.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : documents.status === "error" ? (
        <ErrorState message={documents.message} onRetry={documents.refresh} />
      ) : documents.data.documents.length === 0 ? (
        <EmptyState icon="document-text-outline" title={tr("adm.stuNoDocs")} />
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

      <SectionHeader title={tr("adm.stuConsent")} />
      {consent.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : consent.status === "error" ? (
        <ErrorState message={consent.message} onRetry={consent.refresh} />
      ) : !consent.data.consent ? (
        <EmptyState icon="shield-outline" title={tr("adm.stuNoConsent")} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[t.typography.body, { color: t.colors.text }]}>{consent.data.consent.representativeName}</Text>
            <StatusBadge
              label={CONSENT_STATUS_KEY[consent.data.consent.status] ? tr(CONSENT_STATUS_KEY[consent.data.consent.status]) : consent.data.consent.status}
              tone={consent.data.consent.status === "granted" ? "success" : "neutral"}
            />
          </View>
          {consent.data.consent.scopes.length > 0 ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>{tr("adm.stuScope", { v: consent.data.consent.scopes.join(", ") })}</Text>
          ) : null}
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>{shortDayMonth(new Date(consent.data.consent.grantedAt))}</Text>
        </Card>
      )}

      <SectionHeader title={tr("adm.stuParent")} />
      <Card>
        <Text style={[t.typography.body, { color: t.colors.text }]}>{student.parentName}</Text>
        <Text
          style={[t.typography.body, { color: t.colors.primary, marginTop: 6 }]}
          onPress={() => void Linking.openURL(telHref(student.parentPhone))}
          accessibilityRole="link"
          accessibilityLabel={tr("adm.stuCallA11y", { phone: student.parentPhone })}
        >
          {student.parentPhone} →
        </Text>
      </Card>

      <SectionHeader title={tr("adm.stuAccess")} actionLabel={inviteOpen ? undefined : tr("adm.stuInvite")} onAction={inviteOpen ? undefined : () => setInviteOpen(true)} />
      {actionError ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{actionError}</Text>
        </Card>
      ) : null}
      {inviteOpen ? (
        <Card style={{ marginBottom: 10 }}>
          <TextField label={tr("adm.stuEmail")} value={inviteEmail} onChangeText={setInviteEmail} placeholder={tr("adm.stuEmailPh")} keyboardType="email-address" autoCapitalize="none" />
          <View style={{ height: 12 }} />
          <SelectField
            label={tr("adm.stuAccessType")}
            value={inviteType}
            placeholder={tr("adm.lesPickPh")}
            options={[
              { label: tr("adm.stuGuardianOpt"), value: "GUARDIAN" },
              { label: tr("adm.stuSelfOpt"), value: "SELF" },
            ]}
            onChange={setInviteType}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button label={tr("ui.cancelDefault")} variant="secondary" style={{ flex: 1 }} onPress={() => setInviteOpen(false)} />
            <Button label={tr("adm.stuSendInvite")} style={{ flex: 1 }} loading={accessBusy === "invite"} disabled={!inviteEmail.trim() || !inviteType} onPress={sendInvite} />
          </View>
        </Card>
      ) : null}
      {portalAccess.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : portalAccess.status === "error" ? (
        <ErrorState message={portalAccess.message} onRetry={portalAccess.refresh} />
      ) : portalAccess.data.accounts.length === 0 ? (
        <EmptyState icon="key-outline" title={tr("adm.stuNoAccount")} />
      ) : (
        <View style={{ gap: 8 }}>
          {portalAccess.data.accounts.map((a) => (
            <Card key={a.userId}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.body, { color: t.colors.text }]} numberOfLines={1}>
                    {a.email || tr("adm.stuNoEmail")}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    {a.accessType === "GUARDIAN" ? tr("adm.stuRoleGuardian") : tr("adm.stuRoleStudent")}
                  </Text>
                </View>
                <StatusBadge
                  label={ACCESS_STATUS_KEY[a.status] ? tr(ACCESS_STATUS_KEY[a.status]) : a.status}
                  tone={a.status === "active" ? "success" : a.status === "invited" ? "warning" : "neutral"}
                />
              </View>
              {a.status === "active" ? (
                <Button
                  label={tr("adm.stuRevoke")}
                  size="sm"
                  variant="danger"
                  loading={accessBusy === a.userId}
                  style={{ marginTop: 10 }}
                  onPress={() => setConfirmRevoke({ userId: a.userId, email: a.email })}
                />
              ) : a.status === "revoked" ? (
                <Button
                  label={tr("adm.stuReactivate")}
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
        title={tr("adm.stuPayTitle")}
        message={tr("adm.stuPayMsg")}
        confirmLabel={tr("adm.stuPayConfirm")}
        onConfirm={confirmPayment}
        onCancel={() => setConfirmingPaymentId(null)}
      />

      <ConfirmDialog
        visible={!!confirmRevoke}
        title={tr("adm.stuRevokeTitle")}
        message={confirmRevoke ? tr("adm.stuRevokeMsg", { email: confirmRevoke.email || tr("adm.stuRevokeEmailFb") }) : undefined}
        confirmLabel={tr("adm.stuRevokeConfirm")}
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
