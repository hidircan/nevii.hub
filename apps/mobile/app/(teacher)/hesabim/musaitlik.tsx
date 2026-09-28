import { Text, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel, weekdayNameByIndex } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { AvailabilityRequestsResponse } from "../../../src/types/api";

const STATUS_KEY: Record<string, string> = { pending: "avail.stPending", approved: "avail.stApproved", rejected: "avail.stRejected" };

/**
 * Müsaitlik — salt-okunur. Öğretmen yalnız onaylı güncel müsaitliğini ve
 * geçmiş önerilerin durumunu görüntüler; düzenleme/öneri gönderme bu yüzeyde
 * YOK (müsaitlik günleri yalnız kurum yöneticileri tarafından düzenlenir).
 * Reddedilecek aksiyona götürmek yerine form hiç gösterilmez.
 */
export default function Musaitlik() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const { user } = useAuth();
  const res = useApiGet<AvailabilityRequestsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/availability-requests` : "");

  // Savunmacı okuma — backend normalize etse de legacy/eksik alanlı yanıtlar
  // render crash'e (Cannot read property 'length' of undefined) yol açmamalı.
  const currentAvailability = res.status === "success" ? (res.data?.currentAvailability ?? []) : [];
  const requests = res.status === "success" ? (res.data?.requests ?? []) : [];

  return (
    <Screen>
      <AppHeader title={tr("avail.title")} showBack showNotifications={false} />

      <SectionHeader title={tr("avail.current")} />
      <Card>
        {res.status === "loading" ? (
          <LoadingSkeleton rows={2} />
        ) : res.status === "error" ? (
          <ErrorState message={res.message} onRetry={res.refresh} />
        ) : currentAvailability.length === 0 ? (
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{tr("avail.none")}</Text>
        ) : (
          <View style={{ gap: 4 }}>
            {[...currentAvailability]
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((w, i) => (
                <Text key={`${w.dayOfWeek}-${i}`} style={[t.typography.body, { color: t.colors.text }]}>
                  {weekdayNameByIndex(w.dayOfWeek)}: {w.start}–{w.end}
                </Text>
              ))}
          </View>
        )}
      </Card>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12 }}>
        <Icon name="information-circle-outline" size={16} color={t.colors.textMuted} />
        <Text style={[t.typography.caption, { color: t.colors.textMuted, flex: 1 }]}>
          {tr("avail.note")}
        </Text>
      </View>

      <SectionHeader title={tr("avail.pastTitle")} />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : requests.length === 0 ? (
        <EmptyState icon="time-outline" title={tr("avail.noProposals")} />
      ) : (
        <View style={{ gap: 10 }}>
          {[...requests].reverse().map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(r.createdAt))}</Text>
                <StatusBadge
                  label={STATUS_KEY[r.status] ? tr(STATUS_KEY[r.status]) : r.status}
                  tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}
                />
              </View>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
                {(r.proposedAvailability ?? []).map((w) => `${weekdayNameByIndex(w.dayOfWeek)} ${w.start}-${w.end}`).join(", ")}
              </Text>
              {r.reviewNote ? <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>{tr("avail.notePrefix", { v: r.reviewNote })}</Text> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
