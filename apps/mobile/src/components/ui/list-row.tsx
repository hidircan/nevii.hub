import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Icon, type IconName } from "./icon";

type Props = {
  icon?: IconName;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
};

/**
 * Hiyerarşik liste satırı — bilgi yoğun ekranlarda kart yığını yerine kullanılır.
 * Tek satır başlık + en fazla 2 satır açıklama + sağda meta/chevron; dokunma alanı min 56pt.
 */
export function ListRow({ icon, title, subtitle, meta, onPress }: Props) {
  const t = useTheme();
  const body = (
    <>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: t.colors.bgMuted }]}>
          <Icon name={icon} size={19} color={t.colors.textMuted} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text numberOfLines={1} style={[t.typography.bodyStrong, { color: t.colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text numberOfLines={1} style={[t.typography.caption, { color: t.colors.textMuted }]}>
          {meta}
        </Text>
      ) : null}
      {onPress ? <Icon name="chevron-forward" size={16} color={t.colors.textFaint} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row} accessibilityRole="text">{body}</View>;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 10 },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, minWidth: 0 },
});
