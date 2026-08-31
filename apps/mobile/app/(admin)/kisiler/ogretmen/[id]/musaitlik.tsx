import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPatch } from "../../../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../../../../src/components/ui";
import { useApiGet } from "../../../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../../../src/lib/date";
import { useTheme } from "../../../../../src/theme/theme-context";
import type { AvailabilityRequestsResponse } from "../../../../../src/types/api";

const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const STATUS_LABEL: Record<string, string> = { pending: "İnceleniyor", approved: "Onaylandı", rejected: "Reddedildi" };

export default function TeacherAvailabilityReview() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const res = useApiGet<AvailabilityRequestsResponse>(`/api/v1/teachers/${id}/availability-requests`);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(requestId: string, decision: "approved" | "rejected") {
    setBusyId(requestId);
    await apiPatch(`/api/v1/teachers/availability-requests/${requestId}/review`, { decision });
    setBusyId(null);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Müsaitlik önerileri" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.requests.length === 0 ? (
        <EmptyState icon="time-outline" title="Öneri yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {[...res.data.requests].reverse().map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(r.createdAt))}</Text>
                <StatusBadge label={STATUS_LABEL[r.status] ?? r.status} tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"} />
              </View>
              <Text style={[t.typography.body, { color: t.colors.text, marginTop: 8 }]}>
                {r.proposedAvailability.map((w) => `${DAYS[w.dayOfWeek]} ${w.start}-${w.end}`).join(", ")}
              </Text>
              {r.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Button label="Onayla" size="sm" loading={busyId === r.id} onPress={() => decide(r.id, "approved")} style={{ flex: 1 }} />
                  <Button label="Reddet" size="sm" variant="danger" loading={busyId === r.id} onPress={() => decide(r.id, "rejected")} style={{ flex: 1 }} />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
