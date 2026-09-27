import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/auth-context";
import { BrandMark, Icon, type IconName } from "../src/components/ui";
import { LanguageSelector } from "../src/components/language-selector";
import { useLocale } from "../src/i18n/locale-context";
import { useTheme } from "../src/theme/theme-context";

type PersonaEntry = {
  key: "student" | "teacher" | "admin";
  icon: IconName;
  titleKey: string;
  descKey: string;
  ctaKey: string;
};

const PERSONA_ENTRIES: PersonaEntry[] = [
  {
    key: "student",
    icon: "people-outline",
    titleKey: "welcome.studentTitle",
    descKey: "welcome.studentDesc",
    ctaKey: "welcome.studentCta",
  },
  {
    key: "teacher",
    icon: "school-outline",
    titleKey: "welcome.teacherTitle",
    descKey: "welcome.teacherDesc",
    ctaKey: "welcome.teacherCta",
  },
  {
    key: "admin",
    icon: "briefcase-outline",
    titleKey: "welcome.adminTitle",
    descKey: "welcome.adminDesc",
    ctaKey: "welcome.adminCta",
  },
];

/**
 * Anasayfa (welcome) — oturumsuz ilk durak. Üç persona girişi (öğrenci/veli,
 * öğretmen, yönetici) UX yönlendirmesi içindir; backend tek login
 * endpoint'i kullanır, yetkiyi sunucu rolü belirler. Yönetici seçeneği
 * kurumsal ve sade tutulur, öğrenci/veli deneyimini gölgelemez.
 * Oturumu olan kullanıcı buraya düşmez (index doğrudan persona evine gider).
 */
export default function WelcomeScreen() {
  const { status } = useAuth();
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();

  if (status === "signedIn") return <Redirect href="/" />;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BrandMark size="lg" />
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 12, textAlign: "center" }]}>
          {tr("welcome.subtitle")}
        </Text>

        <View style={styles.entries}>
          {PERSONA_ENTRIES.map((entry) => (
            <Pressable
              key={entry.key}
              accessibilityRole="button"
              accessibilityLabel={tr(entry.titleKey)}
              accessibilityHint={tr(entry.descKey)}
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
                <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr(entry.titleKey)}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{tr(entry.descKey)}</Text>
                <Text style={[t.typography.caption, { color: t.colors.primary, marginTop: 6 }]}>{tr(entry.ctaKey)}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={t.colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 20, textAlign: "center" }]}>
          {tr("welcome.footnote")}
        </Text>

        <View style={styles.language}>
          <LanguageSelector compact />
        </View>
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
  language: { marginTop: 24 },
});
