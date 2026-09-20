import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Icon } from "../components/ui";
import { useTheme } from "../theme/theme-context";
import { useChildSelection } from "./student-context";

/**
 * Aktif öğrenci switcher — yalnız çoklu çocuk velisinde görünür. Ad okunur,
 * dokunma alanı büyük (min 56pt), ikonlar doğal. Ad, zaten yüklenmiş profil
 * verisinden prop olarak gelir (ekstra istek yok).
 */
export function ChildSwitcher({ childName }: { childName?: string }) {
  const t = useTheme();
  const router = useRouter();
  const { isMulti, children, ready } = useChildSelection();

  if (!ready || !isMulti) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={childName ? `Aktif öğrenci: ${childName}. Değiştirmek için dokunun.` : "Öğrenci değiştir"}
      accessibilityHint={`${children.length} öğrenciden birini seçin`}
      onPress={() => router.push("/select-child")}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.colors.bgRaised, borderColor: t.colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Avatar name={childName ?? "Öğrenci"} size={40} />
      <View style={styles.text}>
        <Text style={[t.typography.label, { color: t.colors.textFaint }]}>TAKİP EDİLEN ÖĞRENCİ</Text>
        <Text style={[t.typography.bodyStrong, { color: t.colors.text, marginTop: 1 }]} numberOfLines={1}>
          {childName ?? "Öğrenci seçin"}
        </Text>
      </View>
      <Icon name="swap-horizontal-outline" size={20} color={t.colors.primary} />
      <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  text: { flex: 1, minWidth: 0 },
});
