import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useTheme } from "../../theme/theme-context";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  name: IconName;
  size?: number;
  /** SDK 57: tabBarIcon rengi `ColorValue` (PlatformColor dahil) verir; Ionicons bunu kabul eder. */
  color?: ColorValue;
};

/** Uygulama genelinde tek tutarlı ikon seti (Ionicons) — renk verilmezse tema metin rengini kullanır. */
export function Icon({ name, size = 20, color }: Props) {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.colors.text} />;
}
