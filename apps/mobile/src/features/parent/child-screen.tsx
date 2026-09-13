import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../auth/auth-context";
import { portalErrorMessage } from "../../components/mobile-ui/api-error-message";
import {
  AppHeader,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useTheme } from "../../theme/theme-context";
import type { StudentProfile } from "../../types/api";
import { PARENT_QUICK_LINKS, toChildContextView } from "./child-context";

/**
 * Veli "Çocuğum" ekranı — salt-okunur bağlam + hızlı erişim.
 *
 * Gösterilen öğrenci her zaman backend'in izin verdiği `ctx.studentId`
 * bağlamıdır (auth'tan gelir); istemcide ID tahmin edilmez, URL'de
 * uydurulmaz. Çoklu-çocuk seçici YOK — backend'de ilişkili çocukları
 * listeleyen bir endpoint bulunmuyor (bkz. MUSE_STUDENT_PARENT_BLOCKERS.md);
 * desteklenene kadar sahte selector yapılmaz.
 *
 * Gizlilik: telefon numaraları (öğrenci/veli) bu ekranda gösterilmez.
 */
export function ParentChildScreen({ basePath }: { basePath: "/(parent)" }) {
  const { user } = useAuth();
  const studentId = user?.studentId;

  const res = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title="Çocuğum" />
        <EmptyState
          icon="alert-circle-outline"
          title="Öğrenci bilgisi bulunamadı"
          description="Bu hesapta görüntülenebilir bir öğrenci kaydı bağlı değil."
        />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Çocuğum" subtitle="Aktif öğrenci bağlamı" />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={portalErrorMessage(res.code, res.message)} onRetry={res.refresh} code={res.code} />
      ) : (
        <ChildContextBody profile={res.data} basePath={basePath} onRefresh={res.refresh} />
      )}
    </Screen>
  );
}

/**
 * Profil ad içermiyorsa yanlış isim gösterilmez — empty state'e düşer.
 * Hızlı erişimler `PARENT_QUICK_LINKS` canonical listesinden gelir.
 */
function ChildContextBody({
  profile,
  basePath,
  onRefresh,
}: {
  profile: StudentProfile;
  basePath: "/(parent)";
  onRefresh: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const view = toChildContextView(profile);

  if (!view) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Öğrenci bilgisi yüklenemedi"
        description="Öğrenci kaydı eksik görünüyor. Lütfen kurumunuzla iletişime geçin."
      />
    );
  }

  return (
    <>
      <Card>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Aktif öğrenci: ${view.name}${view.line1 ? `. ${view.line1}` : ""}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <Avatar name={view.name} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
              {view.name}
            </Text>
            {view.line1 ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                {view.line1}
              </Text>
            ) : null}
            {view.line2 ? (
              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                {view.line2}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <SectionHeader title="Hızlı erişim" />
      <View style={{ gap: 10 }}>
        {PARENT_QUICK_LINKS.map((link) => (
          <Card key={link.key} onPress={() => router.push(`${basePath}/${link.href}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name={link.icon} size={20} color={t.colors.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{link.label}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{link.hint}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
            </View>
          </Card>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bilgileri yenile"
        onPress={onRefresh}
        hitSlop={8}
        style={{ marginTop: 16, alignItems: "center", justifyContent: "center", paddingVertical: 12, minHeight: 48 }}
      >
        <Text style={[t.typography.caption, { color: t.colors.primary, fontWeight: "700" }]}>Bilgileri yenile</Text>
      </Pressable>
    </>
  );
}
