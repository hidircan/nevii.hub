import { Redirect } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { UNSUPPORTED_COPY } from "../src/auth/role-to-persona";
import { useChildSelection } from "../src/student/student-context";
import { BrandMark, Button, Icon, type IconName } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

const PERSONA_HOME = {
  admin: "/(admin)/ozet",
  teacher: "/(teacher)/bugun",
  student: "/(student)/anasayfa",
  parent: "/(parent)/anasayfa",
} as const;

/**
 * Uygulama girişi — auth durumuna göre karşılamaya (oturumsuz), persona
 * sekmesine (session restore sonrası doğrudan rol evi), oturum doğrulama
 * hatasına (token'lar korunur, tekrar dene) veya fail-closed "desteklenmeyen
 * hesap" ekranına yönlendirir. Yapay gecikme YOK.
 */
export default function Index() {
  const { status, user, error, retry, logout } = useAuth();
  const selection = useChildSelection();
  const t = useTheme();

  if (status === "loading" || (status === "signedIn" && user && !selection.ready)) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
        <View style={styles.center}>
          <BrandMark size="lg" wordmarkSize={34} />
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 10 }]}>
            Eğitim Kurumları Merkezi Yönetim Sistemi
          </Text>
          <ActivityIndicator color={t.colors.primary} style={{ marginTop: 28 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (status === "error") {
    return (
      <GateScreen
        icon="cloud-offline-outline"
        title="Oturum doğrulanamadı"
        body={error ?? "Sunucuya bağlanılamadı."}
        primary={{ label: "Tekrar dene", onPress: retry }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  // Oturumsuz ilk durak karşılama — doğrudan login formuna düşülmez.
  if (status === "signedOut" || !user) return <Redirect href="/welcome" />;

  if (user.resolution.kind === "unsupported") {
    const copy = UNSUPPORTED_COPY[user.resolution.reason];
    return (
      <GateScreen
        icon="lock-closed-outline"
        title={copy.title}
        body={copy.body}
        primary={{ label: "Web panelini aç", onPress: () => void Linking.openURL(`${API_BASE_URL}${copy.webPath}`) }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  // Guardian çoklu çocuk + seçim yoksa önce picker; SELF ve tek çocuk
  // doğrudan ana sayfaya gider. Picker listesi yalnız sunucu oturumundan gelir.
  if (
    user.resolution.kind === "persona" &&
    user.resolution.persona === "parent" &&
    selection.ready &&
    selection.children.length > 1 &&
    !selection.selectedId
  ) {
    return <Redirect href="/select-child" />;
  }

  return <Redirect href={PERSONA_HOME[user.resolution.persona]} />;
}

type GateAction = { label: string; onPress: () => void };

function GateScreen({ icon, title, body, primary, secondary }: { icon: IconName; title: string; body: string; primary: GateAction; secondary: GateAction }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <View style={[styles.logo, { backgroundColor: t.colors.bgMuted }]}>
          <Icon name={icon} size={30} color={t.colors.textMuted} />
        </View>
        <Text accessibilityRole="header" style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 20, textAlign: "center" }]}>
          {title}
        </Text>
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8, textAlign: "center" }]}>{body}</Text>
        <View style={{ alignSelf: "stretch", gap: 10, marginTop: 28 }}>
          <Button label={primary.label} onPress={primary.onPress} />
          <Button label={secondary.label} onPress={secondary.onPress} variant="secondary" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
