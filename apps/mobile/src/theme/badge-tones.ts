import type { ThemeColors } from "./tokens";

/**
 * Rozet tonları → tema renk anahtarları (React Native importu YOK — node
 * testleri bu modülü doğrudan okuyabilir). `BadgeTone` tipi `status-badge.tsx`
 * ile aynıdır; burada yeniden tanımlanır ki testler RN çekmesin.
 */
export type BadgeToneName = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

export const BADGE_TONE_COLORS: Record<BadgeToneName, { bg: keyof ThemeColors; fg: keyof ThemeColors }> = {
  primary: { bg: "primarySoft", fg: "primaryStrong" },
  success: { bg: "successSoft", fg: "success" },
  warning: { bg: "warningSoft", fg: "warning" },
  danger: { bg: "dangerSoft", fg: "danger" },
  info: { bg: "infoSoft", fg: "info" },
  neutral: { bg: "bgMuted", fg: "textMuted" },
};

export function badgeColors(colors: ThemeColors, tone: BadgeToneName): { bg: string; fg: string } {
  const map = BADGE_TONE_COLORS[tone];
  return { bg: colors[map.bg], fg: colors[map.fg] };
}
