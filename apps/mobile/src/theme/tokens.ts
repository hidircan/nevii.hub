/**
 * Nevii Hub mobil tasarım sistemi — tek kaynak.
 * Marka rengi web'deki --color-primary (amber/kahve) ile uyumlu; koyu tema
 * için ayrı, kontrastı test edilmiş bir palet tanımlı (aynı tonların koyulaştırılmış
 * hali değil — koyu zeminde okunabilirlik için ayrıca ayarlandı).
 *
 * Tipografi: Inter (400/500/600/700) tüm hiyerarşide; Gloock YALNIZ marka
 * kelimesinde (`brand`). Ölçek `display → title → headline → body → caption`
 * sırasıyla tanımlıdır; ekranlar `t.typography.*` token'larını tüketir.
 * Kullanıcı yazı boyutu tercihi `buildTheme(mode, scale)` ile tüm ölçeği
 * orantılı büyütür (bkz. theme-context.tsx).
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Font ailesi token'ları — tek kaynak.
 * - `display`: marka kelimesi (Gloock 400, tek ağırlık) — YALNIZ BrandMark.
 * - `regular`/`medium`/`semibold`/`bold`: Inter kesitleri; kalınlık DOSYA
 *   adıyla seçilir (regular dosya üzerine `fontWeight` override'ı YOK).
 */
export const fonts = {
  display: "Gloock_400Regular",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export type ThemeColors = {
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryOn: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  bg: string;
  bgMuted: string;
  bgRaised: string;
  border: string;
  borderStrong: string;
  divider: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;
  overlay: string;
};

const lightColors: ThemeColors = {
  primary: "#A56A00",
  primaryStrong: "#7A4E00",
  primarySoft: "#FDF3E1",
  primaryOn: "#FFFFFF",
  success: "#2E7D32",
  successSoft: "#E6F4E8",
  warning: "#B45309",
  warningSoft: "#FDEEDD",
  danger: "#B3261E",
  dangerSoft: "#FBEAE9",
  info: "#2B6CB0",
  infoSoft: "#EAF2FB",
  bg: "#FFFFFF",
  bgMuted: "#F7F4EF",
  bgRaised: "#FFFFFF",
  border: "#E7E0D3",
  borderStrong: "#D8CDB8",
  divider: "#EFE9DD",
  text: "#2A2118",
  textMuted: "#6B6152",
  textFaint: "#948B7A",
  textInverse: "#FFFFFF",
  overlay: "rgba(20,16,10,0.45)",
};

const darkColors: ThemeColors = {
  primary: "#E5A94A",
  primaryStrong: "#F0C178",
  primarySoft: "#3A2E1A",
  primaryOn: "#241A08",
  success: "#81C784",
  successSoft: "#1F3320",
  warning: "#F0A857",
  warningSoft: "#3A2A15",
  danger: "#F2B8B5",
  dangerSoft: "#3A2020",
  info: "#7FB2E5",
  infoSoft: "#1E2C3A",
  bg: "#1C1712",
  bgMuted: "#241E17",
  bgRaised: "#2C2419",
  border: "#3A322A",
  borderStrong: "#4A4032",
  divider: "#332C22",
  text: "#F3ECE0",
  textMuted: "#B8AC98",
  textFaint: "#8A7F6C",
  textInverse: "#241A08",
  overlay: "rgba(0,0,0,0.6)",
};

export type TypographyToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700";
  textTransform?: "uppercase";
  letterSpacing?: number;
};

/**
 * Ölçek (8pt grid'e oturan satır yükseklikleri):
 * display 32/40 · title 26/32 · headline 20/26 · body 16/22 · caption 14/19.
 * `screenTitle`/`sectionTitle`/`cardTitle`/`bodyStrong`/`label` eski
 * çağrıların karşılıklarıdır (aynı ölçeğe oturur, paralel ikinci sistem yok).
 * `compact*` — Program ekranındaki kompakt ödev/hakediş özeti (title 15,
 * body 14, caption 12).
 */
export const typography = {
  /** Marka kelimesi — YALNIZ BrandMark (Gloock tek kesit). */
  brand: { fontFamily: fonts.display, fontSize: 32, lineHeight: 40, fontWeight: "400" },
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 40, fontWeight: "700" },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, fontWeight: "700" },
  screenTitle: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, fontWeight: "700" },
  headline: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, fontWeight: "600" },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, fontWeight: "600" },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, fontWeight: "600" },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  caption: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, fontWeight: "500" },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  compactTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, fontWeight: "600" },
  compactBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, fontWeight: "400" },
  compactCaption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, fontWeight: "500" },
} as const satisfies Record<string, TypographyToken>;

export type Typography = { -readonly [K in keyof typeof typography]: TypographyToken };

export type FontScalePreference = "normal" | "large" | "xlarge";

/** Kullanıcı "Yazı boyutu" tercihi — ölçeğin tamamına uygulanır. */
export const FONT_SCALE: Record<FontScalePreference, number> = {
  normal: 1,
  large: 1.15,
  xlarge: 1.3,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function scaleTypography(scale: number): Typography {
  if (scale === 1) return typography;
  const out = {} as Typography;
  for (const key of Object.keys(typography) as Array<keyof Typography>) {
    const token = typography[key];
    out[key] = {
      ...token,
      fontSize: round1(token.fontSize * scale),
      lineHeight: round1(token.lineHeight * scale),
    };
  }
  return out;
}

export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export type Theme = {
  mode: "light" | "dark";
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: Typography;
  fonts: typeof fonts;
  shadow: typeof shadow;
  /** Aktif yazı boyutu çarpanı (1 / 1.15 / 1.3) — AppText ve özel durumlar için. */
  fontScale: number;
};

/** Tema üretimi — yazı boyutu tercihi tüm tipografi ölçeğini orantılı büyütür. */
export function buildTheme(mode: "light" | "dark", scale = 1): Theme {
  return {
    mode,
    colors: mode === "dark" ? darkColors : lightColors,
    spacing,
    radius,
    typography: scaleTypography(scale),
    fonts,
    shadow,
    fontScale: scale,
  };
}

export const lightTheme: Theme = buildTheme("light", 1);
export const darkTheme: Theme = buildTheme("dark", 1);
