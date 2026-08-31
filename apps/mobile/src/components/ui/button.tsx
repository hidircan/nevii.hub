import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Icon, type IconName } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  loading,
  style,
  fullWidth = true,
}: Props) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.colors.primary, fg: t.colors.primaryOn },
    secondary: { bg: t.colors.bgMuted, fg: t.colors.text, border: t.colors.border },
    ghost: { bg: "transparent", fg: t.colors.primary },
    danger: { bg: t.colors.danger, fg: t.colors.primaryOn },
  };
  const p = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? StyleSheet.hairlineWidth : 0,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} color={p.fg} /> : null}
          <Text style={[styles.label, { color: p.fg, fontSize: size === "sm" ? 13 : 15 }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    minHeight: 44,
  },
  md: { paddingVertical: 12, paddingHorizontal: 18 },
  sm: { paddingVertical: 8, paddingHorizontal: 14, minHeight: 36 },
  label: { fontWeight: "600" },
});
