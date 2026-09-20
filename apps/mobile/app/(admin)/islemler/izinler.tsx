import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, ConfirmDialog, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { shortDayMonth } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { LeaveRequestItem, LeaveResponse } from "../../../src/types/api";

const TYPE_LABEL: Record<string, string> = {
  annual: "Yıllık izin",
  sick: "Hastalık izni",
  unpaid: "Ücretsiz izin",
  other: "Diğer",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/**
 * İzin onayları — yalnız kurum sahibi erişir (sunucu `requireStaffSensitiveAccess`;
 * yetkisiz hesap net hata görür). Onay/ret audit log'ludur; karar sonrası
 * liste tazelenir (stale decision: sunucu zaten-kararlı kaydı reddeder).
 */
export default function IzinOnaylari() {
  const t = useTheme();
  const res = useApiGet<LeaveResponse>("/api/v1/leave");
  const [tab, setTab] = useState<"open" | "all">("open");
  const [confirming, setConfirming] = useState<{ item: LeaveRequestItem; decision: "approved" | "rejected" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requests = useMemo(() => {
    if (res.status !== "success") return [];
    const sorted = [...res.data.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return tab === "open" ? sorted.filter((r) => r.status === "pending_approval") : sorted;
  }, [res, tab]);

  async function submitDecision() {
    if (!confirming || busy) return;
    const { item, decision } = confirming;
    setConfirming(null);
    setBusy(true);
    setError(null);
    const result = await apiPost(`/api/v1/leave/${item.id}/decide`, { status: decision });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message || "Karar kaydedilemedi.");
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="İzin onayları" showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label="Bekleyen" selected={tab === "open"} onPress={() => setTab("open")} />
        <FilterChip label="Tümü" selected={tab === "all"} onPress={() => setTab("all")} />
      </View>

      {error ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{error}</Text>
        </Card>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : requests.length === 0 ? (
        <EmptyState icon="calendar-outline" title={tab === "open" ? "Bekleyen izin talebi yok" : "İzin talebi yok"} />
      ) : (
        <View style={{ gap: 10 }}>
          {requests.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]} numberOfLines={1}>
                  {TYPE_LABEL[r.type] ?? r.type} · {r.dayCount} gün
                </Text>
                <StatusBadge
                  label={STATUS_LABEL[r.status] ?? r.status}
                  tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}
                />
              </View>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                {shortDayMonth(new Date(r.startDate))} – {shortDayMonth(new Date(r.endDate))}
              </Text>
              {r.description ? (
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                  {r.description}
                </Text>
              ) : null}
              {r.status === "pending_approval" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Button label="Onayla" size="sm" style={{ flex: 1 }} onPress={() => setConfirming({ item: r, decision: "approved" })} />
                  <Button label="Reddet" size="sm" variant="danger" style={{ flex: 1 }} onPress={() => setConfirming({ item: r, decision: "rejected" })} />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={!!confirming}
        title={confirming?.decision === "approved" ? "İzin onaylansın mı?" : "İzin reddedilsin mi?"}
        message={
          confirming
            ? `${TYPE_LABEL[confirming.item.type] ?? confirming.item.type} · ${confirming.item.dayCount} gün · ${shortDayMonth(new Date(confirming.item.startDate))} – ${shortDayMonth(new Date(confirming.item.endDate))}`
            : undefined
        }
        confirmLabel={confirming?.decision === "approved" ? "Onayla" : "Reddet"}
        danger={confirming?.decision === "rejected"}
        onConfirm={submitDecision}
        onCancel={() => setConfirming(null)}
      />
    </Screen>
  );
}
