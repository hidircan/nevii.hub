import { Text, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { format, formatCurrency } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { PayoutsResponse } from "../../../src/types/api";

export default function TeacherHakedis() {
  const t = useTheme();
  const { user } = useAuth();
  const res = useApiGet<PayoutsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/payouts` : "");

  return (
    <Screen>
      <AppHeader title="Hakedişlerim" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
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
                {format(new Date(p.periodStart), "yyyy-MM-dd")} – {format(new Date(p.periodEnd), "yyyy-MM-dd")} · {Math.round(p.totalMinutes / 60)} saat
              </Text>
              {p.paidAt ? (
                <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>Ödeme: {format(new Date(p.paidAt), "yyyy-MM-dd")}</Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
