import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/theme-context";

/**
 * Kompakt cache durum rozeti (Faz 7). `cachedAt` yoksa hiç render edilmez.
 * Stale durumda nokta + "çevrimdışı olabilir" eki — kullanıcı her zaman
 * verinin tazeliğini bilir.
 */
export function CacheStatus({ cachedAt, isStale }: { cachedAt: string | null; isStale: boolean }) {
  const t = useTheme();
  if (!cachedAt) return null;
  const ms = Date.parse(cachedAt);
  const label = Number.isFinite(ms)
    ? new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : cachedAt;
  return (
    <View style={styles.row} accessibilityLabel={`Son güncelleme ${label}${isStale ? ", güncel olmayabilir" : ""}`}>
      <View style={[styles.dot, { backgroundColor: isStale ? t.colors.warning : t.colors.success }]} />
      <Text style={[t.typography.caption, { color: t.colors.textFaint }]} numberOfLines={1}>
        Son güncelleme: {label}
        {isStale ? " · güncel olmayabilir" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
