import { FlatList, RefreshControl, Text, View } from "react-native";
import { useMakeupRequests } from "../../api/hooks";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../components/ui";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { format, shortDayMonth } from "../../lib/date";
import { makeupStatusBadge } from "../../lib/makeup-view";
import { useTheme } from "../../theme/theme-context";
import type { MakeupRequest } from "../../types/api";
import { guardianMakeupA11yLabel, toGuardianMakeupItems } from "./makeup-view";

/**
 * Guardian "Telafiler" ekranı — salt-okunur.
 *
 * Veri `useMakeupRequests()` canonical hook'undan (`GET /api/v1/makeup`);
 * kapsam sunucuda çözülür (yalnız bağlı öğrenciler), istemcide
 * teacherId/studentId/tenantId/branchId parametresi ÜRETİLMEZ.
 * Oluşturma/onay/iptal/yeniden-planlama/düzenleme CTA'sı YOK;
 * öğretmen/admin operasyonu YOK. Hata metinleri sunucunun Türkçesiyle
 * aynen gösterilir (yeniden çevirme yok); kod ErrorState'e verilir.
 */
export function ParentMakeupScreen() {
  const t = useTheme();
  const res = useMakeupRequests();
  useFocusRefetch(res.refresh);
  const items = res.status === "success" ? toGuardianMakeupItems(res.data.makeupRequests) : [];

  return (
    <Screen scroll={false}>
      <AppHeader title="Telafiler" subtitle="Bağlı öğrencinin telafi kayıtları" />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <GuardianMakeupRow item={item} />}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <EmptyState
              icon="swap-horizontal-outline"
              title="Gösterilecek telafi dersi bulunmuyor."
              description="Açık veya geçmiş telafi kaydı olduğunda burada görünecek."
            />
          }
          refreshControl={<RefreshControl refreshing={false} onRefresh={res.refresh} tintColor={t.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        />
      )}
    </Screen>
  );
}

function Separator() {
  return <View style={{ height: 10 }} />;
}

const when = (iso: string) => `${shortDayMonth(new Date(iso))} · ${format(new Date(iso), "HH:mm")}`;

function GuardianMakeupRow({ item }: { item: MakeupRequest }) {
  const t = useTheme();
  const badge = makeupStatusBadge(item.status);
  return (
    <View accessible accessibilityLabel={guardianMakeupA11yLabel(item, badge.label)}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {item.studentName ? (
              <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
                {item.studentName}
              </Text>
            ) : null}
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
              {[item.teacherName, item.instrument].filter(Boolean).join(" · ") || "Telafi kaydı"}
            </Text>
          </View>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
        {item.sourceLessonStartAt ? (
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 8 }]}>
            Kaçırılan ders: {when(item.sourceLessonStartAt)}
          </Text>
        ) : null}
        {item.confirmedLessonStartAt ? (
          <Text style={[t.typography.caption, { color: t.colors.text, marginTop: 4 }]}>
            Telafi dersi: {when(item.confirmedLessonStartAt)}
          </Text>
        ) : null}
        <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>
          Son geçerlilik: {shortDayMonth(new Date(item.expiresAt))}
        </Text>
        {item.policyNote ? (
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>{item.policyNote}</Text>
        ) : null}
      </Card>
    </View>
  );
}
