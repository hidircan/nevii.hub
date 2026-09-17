import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/auth-context";
import { BrandMark, Button, ListRow } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

const PERSONA_ROWS = [
  { icon: "school-outline", title: "Öğretmenler", subtitle: "Günlük program, ödev ve gelişim takibi" },
  { icon: "book-outline", title: "Öğrenciler", subtitle: "Dersler, ödevler ve gelişim yolculuğu" },
  { icon: "people-outline", title: "Veliler", subtitle: "Çocuğunuzun devam ve ödeme özeti" },
  { icon: "briefcase-outline", title: "Yöneticiler", subtitle: "Program, kişiler ve kurum işlemleri" },
] as const;

/**
 * Karşılama — uygulamanın ilk durağı (oturumsuz). Marka + kısa değer önerisi +
 * tek birincil CTA ("Giriş yap"). Oturumu olan kullanıcı buraya düşmez
 * (index session restore sonrası doğrudan persona evine gider).
 */
export default function WelcomeScreen() {
  const { status } = useAuth();
  const t = useTheme();
  const router = useRouter();

  if (status === "signedIn") return <Redirect href="/" />;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <View style={styles.content}>
        <BrandMark size="lg" />
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 12, textAlign: "center" }]}>
          Eğitim Kurumları Merkezi Yönetim Sistemi
        </Text>

        <View style={[styles.personaList, { borderTopColor: t.colors.divider }]}>
          {PERSONA_ROWS.map((row) => (
            <View key={row.title} style={[styles.rowBorder, { borderBottomColor: t.colors.divider }]}>
              <ListRow icon={row.icon} title={row.title} subtitle={row.subtitle} />
            </View>
          ))}
        </View>

        <View style={styles.cta}>
          <Button label="Giriş yap" onPress={() => router.push("/login")} />
          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 12, textAlign: "center" }]}>
            Kurumunuzun verdiği hesap bilgileriyle devam edin.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  personaList: { marginTop: 28, borderTopWidth: StyleSheet.hairlineWidth },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  cta: { marginTop: 28 },
});
