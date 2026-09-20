import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { fonts } from "../../theme/tokens";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function FilterChip({ label, selected, onPress }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? t.colors.primary : t.colors.bgMuted,
          borderColor: selected ? t.colors.primary : t.colors.border,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? t.colors.primaryOn : t.colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexShrink: 0,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontFamily: fonts.serifSemibold, fontSize: 15, fontWeight: "600" },
});
