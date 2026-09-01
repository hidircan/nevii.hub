import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import type { AdminDashboardSummary } from "../../../src/types/api";
import { Text } from "react-native";
import { useTheme } from "../../../src/theme/theme-context";

/** Finans/hakediş için sade giriş noktası — tam tahsilat/hakediş akışı web panelinde kalır. */
export default function Finans() {
  const t = useTheme();
  const res = useApiGet<AdminDashboardSummary>("/api/v1/dashboard/summary");

  return (
    <Screen>
      <AppHeader title="Finans" showBack showNotifications={false} />

      <SectionHeader title="Tahsilat takibi" />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : (
        <Card>
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{res.data.followUpNeededCount} takip gerektiren tahsilat</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
            Detaylı tahsilat yönetimi ve mesaj taslakları için web panelini kullanın.
          </Text>
        </Card>
      )}

      <SectionHeader title="Hakediş" />
      <EmptyState
        icon="construct-outline"
        title="Mobilde yakında"
        description="Öğretmen hakediş hesaplama ve ödeme akışı şimdilik yalnız web panelinde mevcut."
      />
    </Screen>
  );
}
