import { Text, View } from "react-native";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { format, formatCurrency } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import type { PayoutsResponse } from "../../types/api";

/**
 * Öğretmen hakedişleri — salt-okunur liste (mevcut yetki: kendi payout'ları).
 * Sekme kökü (`showAccount` başlıklı) ve Hesabım içi (geri butonlu) olmak
 * üzere iki sunumda kullanılır; veri kaynağı ve yetki aynıdır.
 */
export function HakedisScreen({ header }: { header: "tab" | "back" }) {
  const t = useTheme();
  const { user } = useAuth();
  const res = useApiGet<PayoutsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/payouts` : "");

  return (
    <Screen>
      {header === "tab" ? (
        <AppHeader title="Hakedişlerim" showAccount="/(teacher)/hesabim" />
      ) : (
        <AppHeader title="Hakedişlerim" showBack showNotifications={false} />
      )}

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
