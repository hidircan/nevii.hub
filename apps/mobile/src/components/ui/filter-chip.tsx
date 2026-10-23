import { AppText } from "./app-text";
import { Pressable, StyleSheet } from "react-native";
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
      accessibilityLabel={label}
      onPress={onPress}
      // Görsel yükseklik korunur; dokunma alanı 44pt kuralına hitSlop ile ulaşır.
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? t.colors.primary : t.colors.bgMuted,
          borderColor: selected ? t.colors.primary : t.colors.border,
        },
      ]}
    >
      <AppText style={[styles.label, { color: selected ? t.colors.primaryOn : t.colors.text }]} numberOfLines={1}>
        {label}
      </AppText>
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
  label: { fontFamily: fonts.semibold, fontSize: 15, fontWeight: "600" },
});
