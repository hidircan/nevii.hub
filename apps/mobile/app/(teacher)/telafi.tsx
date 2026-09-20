import { FlatList, RefreshControl, Text, View } from "react-native";
import { useMakeupRequests } from "../../src/api/hooks";
import { useAuth } from "../../src/auth/auth-context";
import { AppHeader, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, StatusBadge } from "../../src/components/ui";
import { useFocusRefetch } from "../../src/hooks/use-focus-refetch";
import { format, shortDayMonth } from "../../src/lib/date";
import { makeupStatusBadge, teacherMakeupItems } from "../../src/lib/makeup-view";
import { useTheme } from "../../src/theme/theme-context";
import type { MakeupRequest } from "../../src/types/api";

/**
 * Öğretmenin telafi kayıtları — salt-okunur. Kapsam sunucuda (GET /api/v1/makeup,
 * oturumdaki teacherId); onay/iptal/planlama yönetim panelindedir, burada CTA yok.
 * Hata kodu ErrorState'e verilir: 403/404 nötr, ağ/429/5xx "Tekrar dene"; 401'de
 * istemci refresh'i dener, başarısızsa oturum kapanır.
 */
export default function TeacherTelafi() {
  const t = useTheme();
  const { user } = useAuth();
  const res = useMakeupRequests();
  useFocusRefetch(res.refresh);
  const items = res.status === "success" ? teacherMakeupItems(res.data.makeupRequests, user?.teacherId) : [];

  return (
    <Screen scroll={false}>
      <AppHeader title="Telafi" subtitle="Derslerinize ait telafi kayıtları" showBack showNotifications={false} />
      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MakeupRow item={item} />}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <EmptyState
              icon="swap-horizontal-outline"
              title="Telafi kaydı yok"
              description="Derslerinize ait açık veya geçmiş telafi kaydı bulunmuyor."
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

function MakeupRow({ item }: { item: MakeupRequest }) {
  const t = useTheme();
  const badge = makeupStatusBadge(item.status);
  return (
    <View accessible accessibilityLabel={`${item.studentName ?? "Telafi"}, ${item.instrument ?? ""}, ${badge.label}`}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1 }}>
            {item.studentName ? (
              <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{item.studentName}</Text>
            ) : null}
            {item.instrument ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{item.instrument}</Text>
            ) : null}
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
        {item.reason ? (
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 4 }]}>{item.reason}</Text>
        ) : null}
      </Card>
    </View>
  );
}
