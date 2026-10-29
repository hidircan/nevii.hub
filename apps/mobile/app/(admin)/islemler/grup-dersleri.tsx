import { View } from "react-native";
import { AppHeader, AppText, Card, EmptyState, ErrorState, LoadingSkeleton, Screen } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useLocale } from "../../../src/i18n/locale-context";
import { format, shortDayMonth } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { GroupLessonsResponse } from "../../../src/types/api";

/**
 * 2026-10-23 — Grup dersleri (yönetici, salt okunur): doluluk + sonraki oturum. Oluşturma/öğrenci ekleme webde (kayıt ve
 * sözleşme formu orada — öğrenci kaydıyla aynı politika); grup satırları Program'da "Grup dersi" rozetiyle, yoklama öğrenci bazında.
 */
export default function GrupDersleri() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const res = useApiGet<GroupLessonsResponse>("/api/v1/group-lessons");

  return (
    <Screen>
      <AppHeader title={tr("adm.grpTitle")} showBack showNotifications={false} />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.groups.length === 0 ? (
        <EmptyState icon="people-outline" title={tr("adm.grpEmpty")} />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.groups.map((g) => {
            const next = g.nextSessionAt ? new Date(g.nextSessionAt) : null;
            const state = g.status === "ended" ? tr("adm.grpEnded") : g.seats >= g.capacity ? tr("adm.grpFull") : "";
            return (
              <Card key={g.id}>
                <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{g.name}</AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                  {g.instrument} · {g.teacherName} · {g.roomName}
                </AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{g.scheduleLabel}</AppText>
                <AppText style={[t.typography.caption, { color: t.colors.text, marginTop: 6 }]}>
                  {tr("adm.grpSeats", { seats: g.seats, capacity: g.capacity })}
                  {state ? ` · ${state}` : ""} · {tr("adm.grpFee", { fee: g.monthlyFee.toLocaleString("tr-TR") })}
                </AppText>
                {next ? (
                  <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    {tr("adm.grpNext", { when: `${shortDayMonth(next)} ${format(next, "HH:mm")}` })}
                  </AppText>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
      <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 12 }]}>{tr("adm.grpWebNote")}</AppText>
    </Screen>
  );
}
