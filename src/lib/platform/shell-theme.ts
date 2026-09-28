import { terminalShellByDefault } from "../i18n/copy";

export type PlatformShell = "homebrew" | "console" | "plain";

/**
 * Control Center (2026-09-28) — platform kabuğu seçimi (saf karar):
 * - "homebrew": HYPER_ADMIN + kayıtlı tercih YOK + cookie YOK → Homebrew
 *   Hacker varsayılan (hiçbir kayıtlı tercih ezilmez).
 * - "console": kayıtlı tercih yok ama kabuk varsayılanı (koyu-yeşil) durumu.
 * - "plain": kayıtlı tercihi olan kullanıcı — kendi teması.
 */
export function resolvePlatformShell(opts: {
  role: string;
  savedThemeProfile: string | null | undefined;
  cookieTheme: string | null | undefined;
}): PlatformShell {
  if (!terminalShellByDefault(opts.savedThemeProfile)) return "plain";
  if (opts.role === "HYPER_ADMIN" && !opts.cookieTheme) return "homebrew";
  return "console";
}
