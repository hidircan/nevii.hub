import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { formatCurrency } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { CollectionSummaryResponse } from "../../../src/types/api";

/**
 * Finans özeti — tahsilat (bugün/ay/bekleyen/gecikmiş). Tutarlar
 * sunucu-hesaplıdır (`GET /api/v1/payments/summary`); istemcide fiyat
 * hesabı YOK. Detay tahsilat takibinde; tahsilat kaydı `pay` uçlarıyla
 * (idempotent + auditli) yapılır. Bordro/gider web panelindedir.
 */
export default function Finans() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const res = useApiGet<CollectionSummaryResponse>("/api/v1/payments/summary");
  useFocusRefetch(res.autoRefresh);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title={tr("adm.finTitle")} showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.finToday")}</Text>
              <Text style={[t.typography.screenTitle, { color: t.colors.success, marginTop: 4 }]} numberOfLines={1}>
                {formatCurrency(res.data.todayCollected)}
              </Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.finMonth")}</Text>
              <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 4 }]} numberOfLines={1}>
                {formatCurrency(res.data.monthCollected)}
              </Text>
            </Card>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.finPending", { n: res.data.pendingCount })}</Text>
              <Text style={[t.typography.screenTitle, { color: t.colors.warning, marginTop: 4 }]} numberOfLines={1}>
                {formatCurrency(res.data.pendingTotal)}
              </Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.finOverdue", { n: res.data.overdueCount })}</Text>
              <Text style={[t.typography.screenTitle, { color: t.colors.danger, marginTop: 4 }]} numberOfLines={1}>
                {formatCurrency(res.data.overdueTotal)}
              </Text>
            </Card>
          </View>

          <SectionHeader title={tr("adm.finDetail")} />
          <Button label={tr("adm.finOpenColl")} variant="secondary" onPress={() => router.push("/(admin)/islemler/tahsilat")} />

          <View style={{ marginTop: 16 }}>
            <EmptyState
              icon="construct-outline"
              title={tr("adm.finPayrollTitle")}
              description={tr("adm.finPayrollDesc")}
            />
          </View>
        </>
      )}
    </Screen>
  );
}
