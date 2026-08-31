import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";

type Props = {
  progress: number; // 0-100
  tone?: "primary" | "success" | "warning" | "danger" | "info";
  height?: number;
};

export function ProgressBar({ progress, tone = "primary", height = 8 }: Props) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <View style={[styles.track, { backgroundColor: t.colors.bgMuted, height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, backgroundColor: t.colors[tone], borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
  fill: { height: "100%" },
});
