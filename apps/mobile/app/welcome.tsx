import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/auth-context";
import { BrandMark, Icon, type IconName } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

type PersonaEntry = {
  key: "student" | "teacher";
  icon: IconName;
  title: string;
  description: string;
  cta: string;
  a11y: string;
};

const PERSONA_ENTRIES: PersonaEntry[] = [
  {
    key: "student",
    icon: "people-outline",
    title: "Öğrenci / Veli girişi",
    description: "Ders programı, ödevler ve ödeme özeti tek ekranda.",
    cta: "Öğrenci veya veli olarak devam et",
    a11y: "Öğrenci veli girişi",
  },
  {
    key: "teacher",
    icon: "school-outline",
    title: "Öğretmen girişi",
    description: "Günlük program, ödev verme ve gelişim takibi.",
    cta: "Öğretmen olarak devam et",
    a11y: "Öğretmen girişi",
  },
];

/**
 * Karşılama — oturumsuz ilk durak. İki persona girişi (öğrenci/veli,
 * öğretmen) UX yönlendirmesi içindir; backend tek login endpoint'i kullanır.
 * Yönetici için görünür CTA yok — mevcut kurumsal davranış korunur.
 * Oturumu olan kullanıcı buraya düşmez (index doğrudan persona evine gider).
 */
export default function WelcomeScreen() {
  const { status } = useAuth();
  const t = useTheme();
  const router = useRouter();

  if (status === "signedIn") return <Redirect href="/" />;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BrandMark size="lg" />
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 12, textAlign: "center" }]}>
          Dersler, ödevler ve kurum iletişimi tek uygulamada.
        </Text>

        <View style={styles.entries}>
          {PERSONA_ENTRIES.map((entry) => (
            <Pressable
              key={entry.key}
              accessibilityRole="button"
              accessibilityLabel={entry.a11y}
              accessibilityHint={entry.description}
              onPress={() => router.push({ pathname: "/login", params: { persona: entry.key } })}
              style={({ pressed }) => [
                styles.entry,
                { backgroundColor: t.colors.bgRaised, borderColor: t.colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.entryIcon, { backgroundColor: t.colors.bgMuted }]}>
                <Icon name={entry.icon} size={24} color={t.colors.primary} />
              </View>
              <View style={styles.entryText}>
                <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{entry.title}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{entry.description}</Text>
                <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 6 }]}>{entry.cta}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={t.colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 20, textAlign: "center" }]}>
          Kurumunuzun verdiği hesap bilgileriyle devam edin.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  entries: { marginTop: 28, gap: 12 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  entryIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  entryText: { flex: 1 },
});
