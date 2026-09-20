import { Redirect, useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/auth-context";
import { portalErrorMessage } from "../src/components/mobile-ui/api-error-message";
import { AppHeader, Avatar, EmptyState, ErrorState, Icon, LoadingSkeleton } from "../src/components/ui";
import { toChildContextView } from "../src/features/parent/child-context";
import { useApiGet } from "../src/hooks/use-api";
import { useChildSelection } from "../src/student/student-context";
import { useTheme } from "../src/theme/theme-context";
import type { StudentProfile } from "../src/types/api";

/**
 * "Kimi takip etmek istiyorsunuz?" — çoklu çocuk velisi seçim ekranı.
 * Liste YALNIZ sunucu oturumundan gelir (sınırsız sayıda çocuk desteklenir,
 * FlatList ile sanallaştırılır). Her satır kendi profilini sunucudan çeker;
 * sunucunun reddettiği (403/404) satır listelenmez — güvenli hata gösterir.
 * Seçim persist edilir; geçersiz tercih geçersiz sayılır, asla tahmin edilmez.
 */
export default function SelectChildScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const { children, selectedId, select, ready } = useChildSelection();

  if (!user || user.portalAccessType !== "GUARDIAN") return <Redirect href="/" />;
  if (ready && children.length <= 1) return <Redirect href="/" />;

  async function choose(studentId: string) {
    const ok = await select(studentId);
    if (ok) router.replace("/");
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <AppHeader title="Kimi takip etmek istiyorsunuz?" showBack showNotifications={false} />
      <Text style={[t.typography.body, { color: t.colors.textMuted, paddingHorizontal: 20, marginBottom: 12 }]}>
        Her çocuk için yalnız size tanımlı bilgiler gösterilir.
      </Text>
      {!ready ? (
        <View style={{ paddingHorizontal: 20 }}>
          <LoadingSkeleton rows={3} />
        </View>
      ) : (
        <FlatList
          data={children}
          keyExtractor={(id) => id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          accessibilityRole="list"
          renderItem={({ item }) => <ChildRow studentId={item} selected={item === selectedId} onChoose={choose} />}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: 20 }}>
              <EmptyState
                icon="people-outline"
                title="Takip edilecek öğrenci yok"
                description="Aktif öğrenci erişiminiz görünmüyor. Kurumunuzla iletişime geçin."
              />
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ChildRow({ studentId, selected, onChoose }: { studentId: string; selected: boolean; onChoose: (id: string) => void }) {
  const t = useTheme();
  const res = useApiGet<StudentProfile>(`/api/v1/students/${studentId}`);

  if (res.status === "loading") {
    return (
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <LoadingSkeleton rows={1} />
      </View>
    );
  }
  if (res.status === "error") {
    // Sunucu reddetti (yetkisiz/aktif-olmayan erişim): satır gizlenir,
    // genel liste hatası gibi gösterilmez — veri sızıntısı yok.
    if (res.code === "FORBIDDEN" || res.code === "NOT_FOUND" || res.code === "UNAUTHORIZED") return null;
    return (
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <ErrorState message={portalErrorMessage(res.code, res.message)} onRetry={res.refresh} code={res.code} />
      </View>
    );
  }

  const view = toChildContextView(res.data);
  if (!view) return null;

  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${view.name} adlı öğrenciyi seç`}
        accessibilityState={{ selected }}
        onPress={() => void onChoose(studentId)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: selected ? t.colors.primarySoft : t.colors.bgRaised,
            borderColor: selected ? t.colors.primary : t.colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Avatar name={view.name} size={52} photoPath={`/api/v1/students/${studentId}/photo`} />
        <View style={styles.text}>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={2}>
            {view.name}
          </Text>
          {view.line1 ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
              {view.line1}
            </Text>
          ) : null}
        </View>
        <Icon
          name={selected ? "checkmark-circle" : "chevron-forward"}
          size={22}
          color={selected ? t.colors.primary : t.colors.textFaint}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { flex: 1 },
});
