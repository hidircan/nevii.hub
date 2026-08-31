import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Icon, type IconName } from "./icon";

type Props = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
};

/** Sadece gerektiği ekranlarda (ör. yeni ödev/görev/duyuru) kullanılan sağ-alt sabit eylem butonu. */
export function FloatingActionButton({ icon, onPress, accessibilityLabel }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        t.shadow.raised,
        { backgroundColor: t.colors.primary, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Icon name={icon} size={24} color={t.colors.primaryOn} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
