import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/theme-context";

/**
 * Bu ekranın verisi web tarafında yalnız server component + doğrudan tool
 * çağrısıyla üretiliyor, henüz genel bir REST endpoint'i yok (bkz.
 * apps/mobile/README.md "Eksik/gerekli API'ler"). Gerçek veri yerine bunun
 * yerine ne göründüğü net olsun diye bilinçli bir "demo fallback" ekranı.
 */
export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  const t = useTheme();
  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: t.colors.bg }]}>
      <Text style={[styles.title, { color: t.colors.text }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: t.colors.bgMuted, borderColor: t.colors.border }]}>
        <Text style={[styles.badge, { color: t.colors.primary }]}>Yakında</Text>
        <Text style={[styles.note, { color: t.colors.textMuted }]}>{note}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  badge: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  note: { fontSize: 14, lineHeight: 20 },
});
