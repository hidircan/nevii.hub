import { useMemo, useState } from "react";
import { View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatusBadge, TextField, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminDeletionResponse, DeletionRequestStatus } from "../../../src/types/api";

const STATUS_KEY: Record<string, string> = {
  pending: "adm.delStPending",
  approved: "adm.delStApproved",
  rejected: "adm.delStRejected",
  processed: "adm.delStProcessed",
  cancelled: "adm.delStWithdrawn",
};

/**
 * Hesap silme talepleri (admin) — inceleme + onay/red/işlendi.
 * `processed` fiziksel silme DEĞİL; retention'a uygun işlemin tamamlandığı
 * anlamına gelir (mali/denetim kayıtları korunur).
 */
export default function SilmeTalepleri() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const res = useApiGet<AdminDeletionResponse>("/api/v1/account/deletion-requests");
  const [tab, setTab] = useState<"open" | "all">("open");
  const [acting, setActing] = useState<{ id: string; status: "approved" | "rejected" | "processed" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requests = useMemo(() => {
    if (res.status !== "success") return [];
    return tab === "open"
      ? res.data.requests.filter((r) => r.status === "pending" || r.status === "approved")
      : res.data.requests;
  }, [res, tab]);

  function nextActions(status: DeletionRequestStatus): Array<"approved" | "rejected" | "processed"> {
    if (status === "pending") return ["approved", "rejected"];
    if (status === "approved") return ["processed", "rejected"];
    return [];
  }

  async function submitDecision() {
    if (!acting) return;
    setBusy(true);
    setError(null);
    const result = await apiPost("/api/v1/account/deletion-requests/decide", {
      requestId: acting.id,
      status: acting.status,
      ...(note.trim() ? { decisionNote: note.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message || tr("adm.leaveDecideFail"));
      setActing(null);
      res.refresh();
      return;
    }
    setActing(null);
    setNote("");
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("adm.delTitle")} showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label={tr("adm.mkOpen")} selected={tab === "open"} onPress={() => setTab("open")} />
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
        <EmptyState icon="trash-outline" title={tr("adm.delEmpty")} />
      ) : (
        <View style={{ gap: 10 }}>
          {requests.map((r) => {
            const isActingOnThis = acting?.id === r.id;
            return (
              <Card key={r.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <AppText style={[t.typography.body, { color: t.colors.text }]} numberOfLines={1}>
                      {r.email}
                    </AppText>
                    <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{r.role}</AppText>
                  </View>
                  <StatusBadge
                    label={STATUS_KEY[r.status] ? tr(STATUS_KEY[r.status]) : r.status}
                    tone={r.status === "processed" ? "success" : r.status === "rejected" || r.status === "cancelled" ? "neutral" : "warning"}
                  />
                </View>
                {r.reason ? (
                  <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]} numberOfLines={2}>
                    {tr("adm.delReason", { v: r.reason })}
                  </AppText>
                ) : null}
                {r.decisionNote ? (
                  <AppText style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]} numberOfLines={2}>
                    {tr("adm.delDecision", { v: r.decisionNote })}
                  </AppText>
                ) : null}
                {isActingOnThis && acting ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <TextField label={tr("adm.delNoteOptional")} value={note} onChangeText={setNote} placeholder={tr("adm.mkNotePh")} />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button label={tr("ui.cancelDefault")} variant="secondary" size="sm" onPress={() => setActing(null)} style={{ flex: 1 }} />
                      <Button
                        label={acting.status === "approved" ? tr("adm.delSendApprove") : acting.status === "rejected" ? tr("adm.delSendReject") : tr("adm.delMarkDone")}
                        size="sm"
                        variant={acting.status === "rejected" ? "danger" : "primary"}
                        onPress={submitDecision}
                        loading={busy}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                ) : nextActions(r.status).length > 0 ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    {nextActions(r.status).map((s) => (
                      <Button
                        key={s}
                        label={s === "approved" ? tr("adm.delApprove") : s === "rejected" ? tr("adm.delReject") : tr("adm.delMarkDoneShort")}
                        size="sm"
                        variant={s === "rejected" ? "danger" : s === "approved" ? "primary" : "secondary"}
                        style={{ flex: 1 }}
                        onPress={() => {
                          setActing({ id: r.id, status: s });
                          setNote("");
                          setError(null);
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}

    </Screen>
  );
}
