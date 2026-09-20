import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { formatCurrency } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminStudentsResponse, FollowUpCase, FollowUpCasesResponse } from "../../../src/types/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  approved: "Onaylandı",
  sent: "Gönderildi",
  replied: "Yanıtlandı",
  paid: "Tahsil edildi",
  lost: "Kayıp",
};
const OPEN_STATUSES = ["draft", "approved", "sent", "replied"];
const NEXT_STATUS: Record<string, string | null> = { draft: "approved", approved: "sent", sent: "replied", replied: null };
const NEXT_LABEL: Record<string, string> = { draft: "Onayla", approved: "Gönderildi işaretle", sent: "Yanıt geldi işaretle" };

export default function Tahsilat() {
  const t = useTheme();
  const res = useApiGet<FollowUpCasesResponse>("/api/v1/tahsilat/cases");
  const students = useApiGet<AdminStudentsResponse>("/api/v1/students?limit=100");
  const [tab, setTab] = useState<"open" | "all">("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const cases = useMemo(() => {
    if (res.status !== "success") return [];
    return tab === "open" ? res.data.cases.filter((c) => OPEN_STATUSES.includes(c.status)) : res.data.cases;
  }, [res, tab]);

  function studentName(studentId: string): string {
    if (students.status !== "success") return studentId;
    return students.data.students.find((s) => s.id === studentId)?.name ?? studentId;
  }

  async function advance(item: FollowUpCase) {
    const next = NEXT_STATUS[item.status];
    if (!next) return;
    setBusyId(item.id);
    setActionError(null);
    const result = await apiPost("/api/v1/tahsilat/cases", {
      id: item.id,
      paymentId: item.paymentId,
      studentId: item.studentId,
      status: next,
      messageDraft: item.messageDraft,
      attributedAmount: item.attributedAmount,
    });
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.error.message || "Durum güncellenemedi.");
      return;
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Tahsilat takibi" showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label="Açık" selected={tab === "open"} onPress={() => setTab("open")} />
        <FilterChip label="Tümü" selected={tab === "all"} onPress={() => setTab("all")} />
      </View>

      {actionError ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{actionError}</Text>
        </Card>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : cases.length === 0 ? (
        <EmptyState icon="call-outline" title="Takip gereken kayıt yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {cases.map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]}>{studentName(c.studentId)}</Text>
                <StatusBadge label={STATUS_LABEL[c.status] ?? c.status} tone={c.status === "paid" ? "success" : c.status === "lost" ? "danger" : "warning"} />
              </View>
              <Text style={[t.typography.bodyStrong, { color: t.colors.primary, marginTop: 6 }]}>{formatCurrency(c.attributedAmount)}</Text>
              {c.messageDraft ? (
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]} numberOfLines={3}>
                  Taslak mesaj: {c.messageDraft}
                </Text>
              ) : null}
              {NEXT_STATUS[c.status] ? (
                <Button
                  label={NEXT_LABEL[c.status]!}
                  size="sm"
                  variant="secondary"
                  onPress={() => advance(c)}
                  loading={busyId === c.id}
                  style={{ marginTop: 10 }}
                  fullWidth={false}
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 16, textAlign: "center" }]}>
        Mesajlar yalnızca taslaktır — gönderim WhatsApp üzerinden elle yapılır, otomatik gönderim yoktur.
      </Text>
    </Screen>
  );
}
