import { useMemo, useState } from "react";
import { View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, ConfirmDialog, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatusBadge, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { shortDayMonth } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { LeaveRequestItem, LeaveResponse } from "../../../src/types/api";

const TYPE_KEY: Record<string, string> = {
  annual: "adm.leaveTypeAnnual",
  sick: "adm.leaveTypeSick",
  unpaid: "adm.leaveTypeUnpaid",
  other: "adm.leaveTypeOther",
};

const STATUS_KEY: Record<string, string> = {
  draft: "adm.leaveStDraft",
  pending_approval: "adm.leaveStPending",
  approved: "adm.leaveStApproved",
  rejected: "adm.leaveStRejected",
};

/**
 * İzin onayları — yalnız kurum sahibi erişir (sunucu `requireStaffSensitiveAccess`;
 * yetkisiz hesap net hata görür). Onay/ret audit log'ludur; karar sonrası
 * liste tazelenir (stale decision: sunucu zaten-kararlı kaydı reddeder).
 */
export default function IzinOnaylari() {
  const t = useTheme();
  const { t: tr } = useLocale();
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
      setError(result.error.message || tr("adm.leaveDecideFail"));
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("adm.leaveTitle")} showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label={tr("adm.leaveOpen")} selected={tab === "open"} onPress={() => setTab("open")} />
        <FilterChip label={tr("adm.mkAll")} selected={tab === "all"} onPress={() => setTab("all")} />
      </View>

      {error ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <AppText style={[t.typography.body, { color: t.colors.danger }]}>{error}</AppText>
        </Card>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : requests.length === 0 ? (
        <EmptyState icon="calendar-outline" title={tab === "open" ? tr("adm.leaveEmptyOpen") : tr("adm.leaveEmptyAll")} />
      ) : (
        <View style={{ gap: 10 }}>
          {requests.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <AppText style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]} numberOfLines={1}>
                  {TYPE_KEY[r.type] ? tr(TYPE_KEY[r.type]) : r.type} · {tr("adm.leaveDays", { n: r.dayCount })}
                </AppText>
                <StatusBadge
                  label={STATUS_KEY[r.status] ? tr(STATUS_KEY[r.status]) : r.status}
                  tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}
                />
              </View>
              <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                {shortDayMonth(new Date(r.startDate))} – {shortDayMonth(new Date(r.endDate))}
              </AppText>
              {r.description ? (
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                  {r.description}
                </AppText>
              ) : null}
              {r.status === "pending_approval" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Button label={tr("adm.leaveApprove")} size="sm" style={{ flex: 1 }} onPress={() => setConfirming({ item: r, decision: "approved" })} />
                  <Button label={tr("adm.leaveReject")} size="sm" variant="danger" style={{ flex: 1 }} onPress={() => setConfirming({ item: r, decision: "rejected" })} />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={!!confirming}
        title={confirming?.decision === "approved" ? tr("adm.leaveConfirmApprove") : tr("adm.leaveConfirmReject")}
        message={
          confirming
            ? tr("adm.leaveSummary", { type: TYPE_KEY[confirming.item.type] ? tr(TYPE_KEY[confirming.item.type]) : confirming.item.type, n: confirming.item.dayCount, range: `${shortDayMonth(new Date(confirming.item.startDate))} – ${shortDayMonth(new Date(confirming.item.endDate))}` })
            : undefined
        }
        confirmLabel={confirming?.decision === "approved" ? tr("adm.leaveApprove") : tr("adm.leaveReject")}
        danger={confirming?.decision === "rejected"}
        onConfirm={submitDecision}
        onCancel={() => setConfirming(null)}
      />
    </Screen>
  );
}
