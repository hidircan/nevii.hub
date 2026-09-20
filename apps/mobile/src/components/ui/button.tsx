import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { Icon, type IconName } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "danger";
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
    /** Düşük vurgulu metin aksiyonu (geri dön, vazgeç, "sonra") — dolgulu değil. */
    tertiary: { bg: "transparent", fg: t.colors.primary },
    /** `tertiary` ile aynı — geriye dönük uyumluluk için korunur, yeni kod `tertiary` kullanır. */
    ghost: { bg: "transparent", fg: t.colors.primary },
    danger: { bg: t.colors.danger, fg: "#FFFFFF" },
  };
  const p = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? StyleSheet.hairlineWidth : 0,
          opacity: isDisabled ? 0.55 : pressed ? 0.82 : 1,
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
          {/* Uzun Türkçe etiketler taşmaz: en fazla 2 satır, ortalı. */}
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={[styles.label, { color: p.fg, fontFamily: t.fonts.serifBold, fontSize: size === "sm" ? 15 : 17, textAlign: "center" }]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: "secondary" | "primary" | "tertiary";
  disabled?: boolean;
  size?: number;
};

/** Yalnız-ikon aksiyonu — en az 44pt dokunma alanı, optik hizalı ikon. */
export function IconButton({ icon, accessibilityLabel, onPress, variant = "secondary", disabled, size = 44 }: IconButtonProps) {
  const t = useTheme();
  const bg = variant === "primary" ? t.colors.primary : variant === "secondary" ? t.colors.bgMuted : "transparent";
  const fg = variant === "primary" ? t.colors.primaryOn : variant === "secondary" ? t.colors.text : t.colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconBase,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.82 : 1 },
      ]}
    >
      <Icon name={icon} size={20} color={fg} />
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
  label: { fontWeight: "600", flexShrink: 1, lineHeight: 22 },
  iconBase: { alignItems: "center", justifyContent: "center" },
});
