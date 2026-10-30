import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/theme-context";
import { portalTabBarStyle } from "./tab-bar-style";

/**
 * Alt sekme çubuğu — RN tarafı bağlantı (İş 1, 2026-10-30). Saf çekirdek
 * (sabitler + `portalTabBarStyle`) `./tab-bar-style.ts` içinde TEK kaynaktır;
 * burada yalnız inset + tema onunla birleştirilir. Portal layout'ları
 * dokunmadan `usePortalTabBarStyle`'ı kullanır.
 */

export { TAB_ICON_SIZE, TAB_BAR_CONTENT_HEIGHT, portalTabBarStyle, type TabBarColors } from "./tab-bar-style";

/** Portal layout'larında kullanılan hook — inset + temayı burada birleştirir. */
export function usePortalTabBarStyle(extra?: Record<string, unknown>): Record<string, unknown> {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return useMemo(() => portalTabBarStyle(t.colors, insets.bottom, extra), [t, insets.bottom, extra]);
}
