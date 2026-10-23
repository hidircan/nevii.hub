import { AppText } from "../components/ui/app-text";
import { StyleSheet, View } from "react-native";
import { useLocale } from "../i18n/locale-context";
import { getActiveLocale } from "../i18n/locale-store";
import { useTheme } from "../theme/theme-context";

/**
 * Kompakt cache durum rozeti (Faz 7). `cachedAt` yoksa hiç render edilmez.
 * Stale durumda nokta + "çevrimdışı olabilir" eki — kullanıcı her zaman
 * verinin tazeliğini bilir.
 */
export function CacheStatus({ cachedAt, isStale }: { cachedAt: string | null; isStale: boolean }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  if (!cachedAt) return null;
  const tag = getActiveLocale() === "en" ? "en-US" : "tr-TR";
  const ms = Date.parse(cachedAt);
  const label = Number.isFinite(ms)
    ? new Date(ms).toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : cachedAt;
  const staleSuffix = isStale ? `, ${tr("ui.mayBeStale")}` : "";
  return (
    <View style={styles.row} accessibilityLabel={`${tr("ui.lastUpdate", { label })}${staleSuffix}`}>
      <View style={[styles.dot, { backgroundColor: isStale ? t.colors.warning : t.colors.success }]} />
      <AppText style={[t.typography.caption, { color: t.colors.textFaint }]} numberOfLines={1}>
        {tr("ui.lastUpdate", { label })}
        {isStale ? ` · ${tr("ui.mayBeStale")}` : ""}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
