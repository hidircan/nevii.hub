import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../i18n/locale-context";
import { useTheme } from "../theme/theme-context";
import { fonts } from "../theme/tokens";

/**
 * Bu ekranın verisi web tarafında yalnız server component + doğrudan tool
 * çağrısıyla üretiliyor, henüz genel bir REST endpoint'i yok (bkz.
 * apps/mobile/README.md "Eksik/gerekli API'ler"). Gerçek veri yerine bunun
 * yerine ne göründüğü net olsun diye bilinçli bir "demo fallback" ekranı.
 */
export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: t.colors.bg }]}>
      <Text style={[styles.title, { color: t.colors.text }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: t.colors.bgMuted, borderColor: t.colors.border }]}>
        <Text style={[styles.badge, { color: t.colors.primary }]}>{tr("ui.comingSoon")}</Text>
        <Text style={[styles.note, { color: t.colors.textMuted }]}>{note}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  badge: { fontFamily: fonts.serifBold, fontSize: 14, fontWeight: "700", textTransform: "uppercase" },
  note: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 22 },
});
