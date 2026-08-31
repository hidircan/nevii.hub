import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/theme-context";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Tüm kart bileşenlerinin (LessonCard, StudentCard, ...) ortak zemin/gölge/kenarlığı. */
export function Card({ children, onPress, style }: Props) {
  const t = useTheme();
  const base = [styles.card, t.shadow.card, { backgroundColor: t.colors.bgRaised, borderColor: t.colors.border }, style];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...base, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
});
