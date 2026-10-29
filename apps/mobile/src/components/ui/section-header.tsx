import { AppText } from "./app-text";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <AppText style={[t.typography.sectionTitle, { color: t.colors.text }]}>{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText style={[t.typography.bodyStrong, { color: t.colors.primary }]}>{actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12 },
});
