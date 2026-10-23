import { AppText } from "./app-text";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon, type IconName } from "./icon";
import type { BadgeTone } from "./status-badge";

type Props = {
  icon: IconName;
  label: string;
  value: string | number;
  tone?: BadgeTone;
  onPress?: () => void;
};

/** Özet ekranlarındaki tekil sayaç kartı (ör. "Bekleyen yoklama: 3"). */
export function StatCard({ icon, label, value, tone = "neutral", onPress }: Props) {
  const t = useTheme();
  const iconBg = tone === "neutral" ? t.colors.bgMuted : t.colors[`${tone}Soft` as const];
  const iconFg = tone === "neutral" ? t.colors.textMuted : t.colors[tone];

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={18} color={iconFg} />
      </View>
      <AppText style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 10 }]}>{value}</AppText>
      <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
        {label}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
