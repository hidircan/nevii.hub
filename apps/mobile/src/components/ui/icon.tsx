import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTheme } from "../../theme/theme-context";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

/** Uygulama genelinde tek tutarlı ikon seti (Ionicons) — renk verilmezse tema metin rengini kullanır. */
export function Icon({ name, size = 20, color }: Props) {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.colors.text} />;
}
