import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { roleToPersona, useAuth } from "../src/auth/auth-context";
import { Icon } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

/**
 * Uygulama girişi — hafif bir marka karşılama ekranı, ardından auth
 * durumuna göre login veya role uygun sekmeye yönlendirir. Yalnızca
 * GERÇEK auth kontrolü sürdüğü kadar görünür — yapay bir gecikme/sahte
 * yükleme YOK, `status` "loading" olmaktan çıkar çıkmaz hemen yönlendirir.
 */
export default function Index() {
  const { status, user } = useAuth();
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

  if (status === "signedOut" || !user) return <Redirect href="/login" />;

  const persona = roleToPersona(user.role);
  if (persona === "admin") return <Redirect href="/(admin)/ozet" />;
  if (persona === "teacher") return <Redirect href="/(teacher)/bugun" />;
  if (persona === "student") return <Redirect href="/(student)/anasayfa" />;
  return <Redirect href="/(parent)/anasayfa" />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
