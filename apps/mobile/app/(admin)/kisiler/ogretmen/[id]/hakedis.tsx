import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../../../../src/components/ui";
import { useApiGet } from "../../../../../src/hooks/use-api";
import { format, formatCurrency } from "../../../../../src/lib/date";
import { useTheme } from "../../../../../src/theme/theme-context";
import type { PayoutsResponse } from "../../../../../src/types/api";

function currentMonthRange(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { periodStart: format(start, "yyyy-MM-dd"), periodEnd: format(end, "yyyy-MM-dd") };
}

export default function TeacherPayouts() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const res = useApiGet<PayoutsResponse>(`/api/v1/teachers/${id}/payouts`);
  const [creating, setCreating] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createThisMonth() {
    setCreating(true);
    setError(null);
    const { periodStart, periodEnd } = currentMonthRange();
    const createRes = await apiPost(`/api/v1/teachers/${id}/payouts`, { periodStart, periodEnd });
    setCreating(false);
    if (!createRes.ok) {
      setError(createRes.error.message || "Hakediş oluşturulamadı.");
      return;
    }
    res.refresh();
  }

  async function markPaid(payoutId: string) {
    setMarkingId(payoutId);
    await apiPost(`/api/v1/teachers/payouts/${payoutId}/mark-paid`, {});
    setMarkingId(null);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Hakediş" showBack showNotifications={false} />

      <Button label="Bu ayın hakedişini oluştur" onPress={createThisMonth} loading={creating} icon="add-circle-outline" style={{ marginBottom: 16 }} />
      {error ? <Text style={[t.typography.caption, { color: t.colors.danger, marginBottom: 12 }]}>{error}</Text> : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.payouts.length === 0 ? (
        <EmptyState icon="cash-outline" title="Henüz hakediş kaydı yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.payouts.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{formatCurrency(p.totalAmount)}</Text>
                <StatusBadge label={p.status === "paid" ? "Ödendi" : "Bekliyor"} tone={p.status === "paid" ? "success" : "warning"} />
              </View>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
                {format(new Date(p.periodStart), "yyyy-MM-dd")} – {format(new Date(p.periodEnd), "yyyy-MM-dd")}
              </Text>
              {p.status !== "paid" ? (
                <Button label="Ödendi işaretle" size="sm" variant="secondary" loading={markingId === p.id} onPress={() => markPaid(p.id)} style={{ marginTop: 10 }} fullWidth={false} />
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
