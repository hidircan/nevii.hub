/**
 * P1 (2026-09-11) — görünüm policy: kullanıcı tercihi kurum/platform
 * sınırlarını AŞAMAZ. Bugün policy deposu yoktur (kurum ayarlarında policy
 * alanı YOK — kontrol edildi), bu yüzden policy KOD-SEVİYESİ varsayılanlarla
 * uygulanır; kurum-deposu eklendiğinde `resolveAppearancePolicy` oradan
 * okuyacak şekilde tasarlandı (backward-compatible genişleme noktası).
 *
 * SABİT KURALLAR (tasarım kararı — KESİNLİKLE KORU):
 * - Gloock YALNIZ display/headline/brand kapsamındadır; gövde fontu
 *   seçiminde Gloock ENGELLENİR (Inter/normal sans'a düşer). globals.css
 *   `data-font="gloock"` bloğu da buna göre daraltıldı.
 * - Sözleşme Times New Roman kuralı HER DURUMDA korunur (print CSS
 *   `!important` sabitlemesi kullanıcı fontundan ETKİLENMEZ — bkz.
 *   sozlesme-yazdir sayfası; bu modül o davranışı DEĞİŞTİRMEZ).
 */
import {
  DEFAULT_FONT_CHOICE,
  DEFAULT_THEME_PROFILE,
  normalizeDensity,
  normalizeFontChoice,
  normalizeThemeProfile,
  type Density,
  type FontChoice,
  type ThemeProfile,
} from "./theme";

export type AppearancePolicy = {
  /** Koyu tema profillerine izin var mı (kurum dark_only değilse true). */
  allowDarkProfiles: boolean;
  /** Gövde fontu için izinli seçenekler (Gloock HARİÇ — display-only). */
  allowedBodyFonts: readonly FontChoice[];
};

export const DARK_THEME_PROFILES: readonly ThemeProfile[] = ["obsidian"];

export const BODY_FONT_ALLOWLIST: readonly FontChoice[] = [
  "inter",
  "noto_sans",
  "roboto_serif",
  "playfair_display",
];

export function resolveAppearancePolicy(): AppearancePolicy {
  return { allowDarkProfiles: true, allowedBodyFonts: BODY_FONT_ALLOWLIST };
}

/** Policy'e aykırı tercihi güvenli değere indirger — asla hata fırlatmaz. */
export function clampPreferencesToPolicy(
  prefs: { themeProfile?: ThemeProfile; fontChoice?: FontChoice; density?: Density },
  policy: AppearancePolicy = resolveAppearancePolicy()
): { themeProfile: ThemeProfile; fontChoice: FontChoice; density: Density } {
  const themeProfile = normalizeThemeProfile(prefs.themeProfile);
  const fontChoice = normalizeFontChoice(prefs.fontChoice);
  const density = normalizeDensity(prefs.density);
  return {
    themeProfile:
      !policy.allowDarkProfiles && (DARK_THEME_PROFILES as readonly string[]).includes(themeProfile)
        ? DEFAULT_THEME_PROFILE
        : themeProfile,
    fontChoice: (policy.allowedBodyFonts as readonly string[]).includes(fontChoice)
      ? fontChoice
      : DEFAULT_FONT_CHOICE,
    density,
  };
}
