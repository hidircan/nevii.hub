import { Text, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../src/lib/date";
import { AVAILABILITY_DAYS as DAYS } from "../../../src/lib/availability-form";
import { useTheme } from "../../../src/theme/theme-context";
import type { AvailabilityRequestsResponse } from "../../../src/types/api";

const STATUS_LABEL: Record<string, string> = { pending: "İnceleniyor", approved: "Onaylandı", rejected: "Reddedildi" };

/**
 * Müsaitlik — salt-okunur. Öğretmen yalnız onaylı güncel müsaitliğini ve
 * geçmiş önerilerin durumunu görüntüler; düzenleme/öneri gönderme bu yüzeyde
 * YOK (müsaitlik günleri yalnız kurum yöneticileri tarafından düzenlenir).
 * Reddedilecek aksiyona götürmek yerine form hiç gösterilmez.
 */
export default function Musaitlik() {
  const t = useTheme();
  const { user } = useAuth();
  const res = useApiGet<AvailabilityRequestsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/availability-requests` : "");

  return (
    <Screen>
      <AppHeader title="Müsaitlik" showBack showNotifications={false} />

      <SectionHeader title="Şu anki müsaitlik" />
      <Card>
        {res.status === "loading" ? (
          <LoadingSkeleton rows={2} />
        ) : res.status === "error" ? (
          <ErrorState message={res.message} onRetry={res.refresh} />
        ) : res.data.currentAvailability.length === 0 ? (
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>Kayıtlı müsaitlik yok.</Text>
        ) : (
          <View style={{ gap: 4 }}>
            {[...res.data.currentAvailability]
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((w, i) => (
                <Text key={`${w.dayOfWeek}-${i}`} style={[t.typography.body, { color: t.colors.text }]}>
                  {DAYS[w.dayOfWeek]}: {w.start}–{w.end}
                </Text>
              ))}
          </View>
        )}
      </Card>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12 }}>
        <Icon name="information-circle-outline" size={16} color={t.colors.textMuted} />
        <Text style={[t.typography.caption, { color: t.colors.textMuted, flex: 1 }]}>
          Müsaitlik günleri yalnız kurum yöneticileri tarafından düzenlenir. Değişiklik talebiniz için kurum
          yöneticinizle iletişime geçin.
        </Text>
      </View>

      <SectionHeader title="Geçmiş öneriler" />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.requests.length === 0 ? (
        <EmptyState icon="time-outline" title="Kayıtlı öneri yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {[...res.data.requests].reverse().map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(r.createdAt))}</Text>
                <StatusBadge
                  label={STATUS_LABEL[r.status] ?? r.status}
                  tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}
                />
              </View>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
                {r.proposedAvailability.map((w) => `${DAYS[w.dayOfWeek]} ${w.start}-${w.end}`).join(", ")}
              </Text>
              {r.reviewNote ? <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>Not: {r.reviewNote}</Text> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
