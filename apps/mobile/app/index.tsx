import { Redirect } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../src/api/client";
import { useAuth } from "../src/auth/auth-context";
import { UNSUPPORTED_COPY } from "../src/auth/role-to-persona";
import { Button, Icon, type IconName } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

const PERSONA_HOME = {
  admin: "/(admin)/ozet",
  teacher: "/(teacher)/bugun",
  student: "/(student)/anasayfa",
  parent: "/(parent)/anasayfa",
} as const;

/**
 * Uygulama girişi — auth durumuna göre login'e, persona sekmesine, oturum
 * doğrulama hatasına (token'lar korunur, tekrar dene) veya fail-closed
 * "desteklenmeyen hesap" ekranına yönlendirir. Yapay gecikme YOK.
 */
export default function Index() {
  const { status, user, error, retry, logout } = useAuth();
  const t = useTheme();

  if (status === "loading") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
        <View style={styles.center}>
          <View style={[styles.logo, { backgroundColor: t.colors.primarySoft }]}>
            <Icon name="musical-notes" size={34} color={t.colors.primary} />
          </View>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 20 }]}>Nevii Hub</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
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

  if (status === "signedOut" || !user) return <Redirect href="/login" />;

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
