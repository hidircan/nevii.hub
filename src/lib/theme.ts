/**
 * Görünüm tercihi kimlik doğrulama/kurum kapsamından tamamen bağımsızdır —
 * yalnızca görsel bir tercihtir, hiçbir yetki/kurum/veri kararını etkilemez.
 * Kullanıcının kişisel tercihi olarak saklanır (kurum genelini değiştirmez).
 *
 * Kasıtlı olarak dark mode YOK (`@custom-variant dark` hiçbir yerde tetiklenmez,
 * bkz. globals.css) — ANCAK "obsidian" bir TEMA PROFİLİ olarak gerçekten koyu
 * render edilir (token bazlı, Tailwind dark: varyantından bağımsız). Cookie
 * ADLARI ("notaplan_...") teknik/uyumluluk identifier'ıdır, marka geçişinden
 * ETKİLENMEZ — bkz. src/lib/brand.ts.
 */
export type ThemeProfile =
  | "gold"
  | "obsidian"
  | "navy"
  | "forest"
  | "burgundy"
  | "ocean"
  | "lavender"
  | "atolye"
  | "murekkep";
export type FontChoice = "roboto_serif" | "playfair_display" | "inter" | "noto_sans";

export const THEME_PROFILE_COOKIE = "notaplan_theme_profile";
export const FONT_COOKIE = "notaplan_font";

export const THEME_PROFILE_VALUES: readonly ThemeProfile[] = [
  "gold",
  "obsidian",
  "navy",
  "forest",
  "burgundy",
  "ocean",
  "lavender",
  "atolye",
  "murekkep",
];
export const FONT_VALUES: readonly FontChoice[] = ["roboto_serif", "playfair_display", "inter", "noto_sans"];

export const THEME_PROFILE_LABELS: Record<ThemeProfile, string> = {
  gold: "Kurumsal Altın",
  obsidian: "Gece Obsidyen",
  navy: "Lacivert Kurumsal",
  forest: "Orman Yeşili",
  burgundy: "Bordo Klasik",
  ocean: "Okyanus Mavisi",
  lavender: "Lavanta Grafit",
  atolye: "Atölye",
  murekkep: "Mürekkep",
};

/** Görünüm ayarları ekranındaki 1 satırlık tema açıklamaları (İş 3C). */
export const THEME_PROFILE_DESCRIPTIONS: Record<ThemeProfile, string> = {
  gold: "Sıcak, kurumsal varsayılan — altın vurgulu açık zemin.",
  obsidian: "Antrasit koyu arayüz, altın vurgu — yoğun/gece kullanımı için.",
  navy: "Lacivert vurgulu, resmi kurumsal görünüm.",
  forest: "Sakin yeşil vurgulu açık tema.",
  burgundy: "Bordo vurgulu, klasik akademik hava.",
  ocean: "Okyanus mavisi vurgulu, ferah açık tema.",
  lavender: "Grafit-lavanta vurgulu, nötr açık tema.",
  atolye: "Sıcak kağıt dokusu, toprak tonu vurgu — atölye/stüdyo hissi.",
  murekkep: "Gri-krem zemin, lacivert mürekkep metin — tablo/liste odaklı, resmi akademi karakteri.",
};

/**
 * Kullanıcı menüsündeki sadeleştirilmiş hızlı tema seçimi (İş 3C) — tüm
 * profillerin tamamı yerine 5 küratörlü seçenek sunar: "Sistem / Kurumsal /
 * Atölye / Gece Vardiyası / Mürekkep". "system" bir gerçek `ThemeProfile`
 * DEĞİLDİR — cookie'yi TAMAMEN temizleyip fabrika varsayılanına (gold =
 * "Kurumsal Altın") dönmek anlamına gelir (`actionResetThemePreferences` ile
 * aynı mekanizma). "Gece Vardiyası" burada mevcut "obsidian" profiline
 * eşlenir — sistemdeki TEK gerçek koyu tema zaten bu spesifikasyona uyuyor,
 * ikinci bir neredeyse-özdeş koyu profil icat edilmedi. Gelişmiş tüm
 * profiller `/gorunum-ayarlari` sayfasında hâlâ erişilebilir kalır.
 */
export type QuickThemeChoice = "system" | "kurumsal" | "atolye" | "gece" | "murekkep";
export const QUICK_THEME_TO_PROFILE: Record<Exclude<QuickThemeChoice, "system">, ThemeProfile> = {
  kurumsal: "gold",
  atolye: "atolye",
  gece: "obsidian",
  murekkep: "murekkep",
};

export const FONT_LABELS: Record<FontChoice, string> = {
  roboto_serif: "Roboto Serif",
  playfair_display: "Playfair Display",
  inter: "Inter",
  noto_sans: "Noto Sans",
};

export const DEFAULT_THEME_PROFILE: ThemeProfile = "gold";
export const DEFAULT_FONT_CHOICE: FontChoice = "inter";

/** Bilinmeyen/eksik bir cookie değerini güvenle varsayılana indirger — asla hata fırlatmaz. */
export function normalizeThemeProfile(value: string | undefined | null): ThemeProfile {
  return (THEME_PROFILE_VALUES as readonly string[]).includes(value ?? "")
    ? (value as ThemeProfile)
    : DEFAULT_THEME_PROFILE;
}

export function normalizeFontChoice(value: string | undefined | null): FontChoice {
  return (FONT_VALUES as readonly string[]).includes(value ?? "") ? (value as FontChoice) : DEFAULT_FONT_CHOICE;
}

/**
 * Yoğunluk tercihi (İş 4D) — "Rahat" (varsayılan) / "Kompakt". Tema profili
 * ile AYNI mekanizma (kişisel, cookie tabanlı, kimlik/kurum kapsamından
 * bağımsız). Kompakt mod yalnızca masaüstünde header/sidebar dikey
 * boşluğunu azaltır (`globals.css`, `@media (min-width: 768px)` ile
 * korumalı) — mobilde dokunma hedefleri asla 44px altına düşmez.
 */
export type Density = "comfortable" | "compact";
export const DENSITY_COOKIE = "notaplan_density";
export const DENSITY_VALUES: readonly Density[] = ["comfortable", "compact"];
export const DENSITY_LABELS: Record<Density, string> = {
  comfortable: "Rahat",
  compact: "Kompakt",
};
export const DEFAULT_DENSITY: Density = "comfortable";

export function normalizeDensity(value: string | undefined | null): Density {
  return (DENSITY_VALUES as readonly string[]).includes(value ?? "") ? (value as Density) : DEFAULT_DENSITY;
}
