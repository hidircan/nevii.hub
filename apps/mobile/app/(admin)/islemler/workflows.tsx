import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPatch } from "../../../src/api/client";
import { AppHeader, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { relativeDayLabel } from "../../../src/lib/date";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { WorkflowsResponse } from "../../../src/types/api";

export default function Workflows() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const res = useApiGet<WorkflowsResponse>("/api/v1/workflows");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    setBusyId(id);
    await apiPatch(`/api/v1/workflows/${id}`, { enabled: !enabled });
    setBusyId(null);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("adm.wfTitle")} showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.workflows.length === 0 ? (
        <EmptyState icon="sync-outline" title={tr("adm.wfEmpty")} />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.workflows.map((w) => (
            <Card key={w.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]}>{w.name}</Text>
                <Pressable onPress={() => toggle(w.id, w.enabled)} disabled={busyId === w.id} hitSlop={8}>
                  <Icon name={w.enabled ? "toggle" : "toggle-outline"} size={32} color={w.enabled ? t.colors.primary : t.colors.textFaint} />
                </Pressable>
              </View>
              {w.description ? (
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>{w.description}</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                {w.lastRunAt ? (
                  <StatusBadge label={tr("adm.wfLastRun", { v: relativeDayLabel(new Date(w.lastRunAt)) })} tone={w.lastSuccess ? "success" : "danger"} />
                ) : (
                  <StatusBadge label={tr("adm.wfNever")} tone="neutral" />
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
