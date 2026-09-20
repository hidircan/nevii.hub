import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatusBadge, TextField } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { format } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { MakeupRequest, MakeupResponse } from "../../../src/types/api";

const OPEN_STATUSES = ["pending", "suggested", "awaiting_info"];
const STATUS_LABEL: Record<string, string> = {
  pending: "Bekliyor",
  suggested: "Öneri var",
  awaiting_info: "Bilgi bekleniyor",
  confirmed: "Onaylandı",
  completed: "Tamamlandı",
  expired: "Süresi doldu",
  cancelled: "İptal edildi",
};

export default function Telafi() {
  const t = useTheme();
  const res = useApiGet<MakeupResponse>("/api/v1/makeup");
  const [tab, setTab] = useState<"open" | "all">("open");
  const [acting, setActing] = useState<{ request: MakeupRequest; kind: "confirm" | "cancel" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requests = useMemo(() => {
    if (res.status !== "success") return [];
    return tab === "open" ? res.data.makeupRequests.filter((m) => OPEN_STATUSES.includes(m.status)) : res.data.makeupRequests;
  }, [res, tab]);

  function startAction(request: MakeupRequest, kind: "confirm" | "cancel") {
    setActing({ request, kind });
    setNote("");
    setError(null);
  }

  async function submitDecision() {
    if (!acting) return;
    if (!note.trim()) {
      setError("Karar notu zorunludur.");
      return;
    }
    setBusy(true);
    setError(null);
    const path = acting.kind === "confirm" ? "/api/v1/makeup/confirm" : "/api/v1/makeup/cancel";
    const body =
      acting.kind === "confirm"
        ? { requestId: acting.request.id, slot: acting.request.suggestedSlots[0], decisionNote: note.trim() }
        : { requestId: acting.request.id, decisionNote: note.trim() };
    const submitRes = await apiPost(path, body);
    setBusy(false);
    if (!submitRes.ok) {
      setError(submitRes.error.message || "İşlem başarısız.");
      return;
    }
    setActing(null);
    setNote("");
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Telafi merkezi" showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label="Açık" selected={tab === "open"} onPress={() => setTab("open")} />
        <FilterChip label="Tümü" selected={tab === "all"} onPress={() => setTab("all")} />
      </View>

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : requests.length === 0 ? (
        <EmptyState icon="swap-horizontal-outline" title="Telafi talebi yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {requests.map((r) => {
            const slot = r.suggestedSlots[0];
            const isActingOnThis = acting?.request.id === r.id;
            return (
              <Card key={r.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]}>
                    {r.studentName ?? "Öğrenci"} · {r.teacherName ?? "Öğretmen"}
                  </Text>
                  <StatusBadge label={STATUS_LABEL[r.status] ?? r.status} tone={r.status === "confirmed" ? "success" : "warning"} />
                </View>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>{r.instrument} · {r.reason}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>
                  Son geçerlilik: {format(new Date(r.expiresAt), "yyyy-MM-dd")}
                </Text>
                {slot ? (
                  <Text style={[t.typography.caption, { color: t.colors.info, marginTop: 4 }]}>
                    Önerilen: {format(new Date(slot.startAt), "yyyy-MM-dd")} {format(new Date(slot.startAt), "HH:mm")}
                  </Text>
                ) : null}

                {isActingOnThis ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    <TextField label="Karar notu (zorunlu)" value={note} onChangeText={setNote} placeholder="Kısa açıklama" />
                    {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setActing(null)} style={{ flex: 1 }} />
                      <Button
                        label={acting.kind === "confirm" ? "Onayı gönder" : "İptali gönder"}
                        size="sm"
                        variant={acting.kind === "cancel" ? "danger" : "primary"}
                        onPress={submitDecision}
                        loading={busy}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                ) : OPEN_STATUSES.includes(r.status) ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Button label="Onayla" size="sm" disabled={!slot} onPress={() => startAction(r, "confirm")} style={{ flex: 1 }} />
                    <Button label="İptal et" size="sm" variant="danger" onPress={() => startAction(r, "cancel")} style={{ flex: 1 }} />
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
