import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatusBadge, TextField } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminDeletionResponse, DeletionRequestStatus } from "../../../src/types/api";

const STATUS_LABEL: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  processed: "İşlendi",
  cancelled: "Geri çekildi",
};

/**
 * Hesap silme talepleri (admin) — inceleme + onay/red/işlendi.
 * `processed` fiziksel silme DEĞİL; retention'a uygun işlemin tamamlandığı
 * anlamına gelir (mali/denetim kayıtları korunur).
 */
export default function SilmeTalepleri() {
  const t = useTheme();
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
      setError(result.error.message || "Karar kaydedilemedi.");
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
      <AppHeader title="Silme talepleri" showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label="Açık" selected={tab === "open"} onPress={() => setTab("open")} />
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
        <EmptyState icon="trash-outline" title="Silme talebi yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {requests.map((r) => {
            const isActingOnThis = acting?.id === r.id;
            return (
              <Card key={r.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.typography.body, { color: t.colors.text }]} numberOfLines={1}>
                      {r.email}
                    </Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{r.role}</Text>
                  </View>
                  <StatusBadge
                    label={STATUS_LABEL[r.status] ?? r.status}
                    tone={r.status === "processed" ? "success" : r.status === "rejected" || r.status === "cancelled" ? "neutral" : "warning"}
                  />
                </View>
                {r.reason ? (
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]} numberOfLines={2}>
                    Gerekçe: {r.reason}
                  </Text>
                ) : null}
                {r.decisionNote ? (
                  <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]} numberOfLines={2}>
                    Karar notu: {r.decisionNote}
                  </Text>
                ) : null}
                {isActingOnThis && acting ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <TextField label="Karar notu (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Kısa açıklama" />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setActing(null)} style={{ flex: 1 }} />
                      <Button
                        label={acting.status === "approved" ? "Onayı gönder" : acting.status === "rejected" ? "Reddi gönder" : "İşlendi olarak işaretle"}
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
                        label={s === "approved" ? "Onayla" : s === "rejected" ? "Reddet" : "İşlendi işaretle"}
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
