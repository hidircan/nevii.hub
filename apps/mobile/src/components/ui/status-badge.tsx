import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { fonts } from "../../theme/tokens";

export type BadgeTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  label: string;
  tone?: BadgeTone;
};

export function StatusBadge({ label, tone = "neutral" }: Props) {
  const t = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    primary: { bg: t.colors.primarySoft, fg: t.colors.primaryStrong },
    success: { bg: t.colors.successSoft, fg: t.colors.success },
    warning: { bg: t.colors.warningSoft, fg: t.colors.warning },
    danger: { bg: t.colors.dangerSoft, fg: t.colors.danger },
    info: { bg: t.colors.infoSoft, fg: t.colors.info },
    neutral: { bg: t.colors.bgMuted, fg: t.colors.textMuted },
  };
  const c = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  text: { fontFamily: fonts.serifBold, fontSize: 14, fontWeight: "700" },
});
