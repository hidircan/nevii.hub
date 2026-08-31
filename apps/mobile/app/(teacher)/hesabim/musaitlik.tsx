import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader, StatusBadge, TextField } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../src/lib/date";
import {
  AVAILABILITY_DAYS as DAYS,
  buildProposedAvailability,
  emptyAvailabilityRows,
  isAvailabilitySubmittable,
  type AvailabilityDayRow,
} from "../../../src/lib/availability-form";
import { useTheme } from "../../../src/theme/theme-context";
import type { AvailabilityRequestsResponse } from "../../../src/types/api";

const STATUS_LABEL: Record<string, string> = { pending: "İnceleniyor", approved: "Onaylandı", rejected: "Reddedildi" };

export default function Musaitlik() {
  const t = useTheme();
  const { user } = useAuth();
  const res = useApiGet<AvailabilityRequestsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/availability-requests` : "");

  const [rows, setRows] = useState<AvailabilityDayRow[]>(emptyAvailabilityRows());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  // Confirmation banner is transient so the teacher can keep adding and
  // submitting more suggestions in the same session instead of it locking
  // the form (that was the original bug: leave/re-enter was the only way
  // to send a second batch).
  useEffect(() => {
    if (sentAt === null) return;
    const timer = setTimeout(() => setSentAt(null), 4000);
    return () => clearTimeout(timer);
  }, [sentAt]);

  function updateRow(i: number, patch: Partial<AvailabilityDayRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const canSubmit = isAvailabilitySubmittable(rows) && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const proposedAvailability = buildProposedAvailability(rows);
    const submitRes = await apiPost("/api/v1/teachers/availability/propose", { proposedAvailability });
    setBusy(false);
    if (!submitRes.ok) {
      setError(submitRes.error.message || "Müsaitlik önerisi gönderilemedi.");
      return;
    }
    setRows(emptyAvailabilityRows());
    setSentAt(Date.now());
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Müsaitlik" showBack showNotifications={false} />

      <SectionHeader title="Şu anki müsaitlik" />
      <Card>
        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 8 }]}>
          Yönetici tarafından onaylanmış, şu anda geçerli müsaitliğiniz. Bunu değiştirmek için aşağıdan öneri gönderin.
        </Text>
        {res.status === "loading" ? (
          <LoadingSkeleton rows={2} />
        ) : res.status === "error" ? (
          <ErrorState message={res.message} onRetry={res.refresh} />
        ) : res.data.currentAvailability.length === 0 ? (
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>Kayıtlı müsaitlik yok.</Text>
        ) : (
          <View style={{ gap: 4 }}>
            {[...res.data.currentAvailability]
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((w, i) => (
                <Text key={`${w.dayOfWeek}-${i}`} style={[t.typography.body, { color: t.colors.text }]}>
                  {DAYS[w.dayOfWeek]}: {w.start}–{w.end}
                </Text>
              ))}
          </View>
        )}
      </Card>

      <SectionHeader title="Yeni müsaitlik öner" />
      <Card>
        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 12 }]}>
          Uygun olduğunuz günleri işaretleyip saat aralığını girin. Öneriniz yönetici onayına gider.
        </Text>
        <View style={{ gap: 14 }}>
          {DAYS.map((day, i) => (
            <View key={day}>
              <Pressable
                onPress={() => updateRow(i, { enabled: !rows[i]!.enabled })}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: rows[i]!.enabled ? 8 : 0 }}
              >
                <StatusBadge label={day} tone={rows[i]!.enabled ? "primary" : "neutral"} />
              </Pressable>
              {rows[i]!.enabled ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <TextField label="Başlangıç" value={rows[i]!.start} onChangeText={(v) => updateRow(i, { start: v })} placeholder="09:00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField label="Bitiş" value={rows[i]!.end} onChangeText={(v) => updateRow(i, { end: v })} placeholder="18:00" />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {error ? <Text style={{ color: t.colors.danger, marginTop: 12 }}>{error}</Text> : null}
        {sentAt !== null ? <Text style={{ color: t.colors.success, marginTop: 12 }}>Öneriniz gönderildi. Dilerseniz yeni bir öneri daha ekleyip gönderebilirsiniz.</Text> : null}
        <Button label="Öneriyi gönder" onPress={onSubmit} disabled={!canSubmit} loading={busy} style={{ marginTop: 16 }} />
      </Card>

      <SectionHeader title="Geçmiş öneriler" />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.requests.length === 0 ? (
        <EmptyState icon="time-outline" title="Henüz öneri göndermediniz" />
      ) : (
        <View style={{ gap: 10 }}>
          {[...res.data.requests].reverse().map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{relativeDayLabel(new Date(r.createdAt))}</Text>
                <StatusBadge
                  label={STATUS_LABEL[r.status] ?? r.status}
                  tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}
                />
              </View>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
                {r.proposedAvailability.map((w) => `${DAYS[w.dayOfWeek]} ${w.start}-${w.end}`).join(", ")}
              </Text>
              {r.reviewNote ? <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>Not: {r.reviewNote}</Text> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
