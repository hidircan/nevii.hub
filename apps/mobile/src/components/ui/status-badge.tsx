import { AppText } from "./app-text";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { badgeColors, badgeStyles } from "./badge-style";

export type BadgeTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  label: string;
  tone?: BadgeTone;
};

export function StatusBadge({ label, tone = "neutral" }: Props) {
  const t = useTheme();
  const c = badgeColors(t.colors, tone);
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <AppText style={[badgeStyles.text, { color: c.fg }]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start", maxWidth: "100%" },
});
