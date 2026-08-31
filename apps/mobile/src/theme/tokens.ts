/**
 * Nevii Hub mobil tasarım sistemi — tek kaynak.
 * Marka rengi web'deki --color-primary (amber/kahve) ile uyumlu; koyu tema
 * için ayrı, kontrastı test edilmiş bir palet tanımlı (aynı tonların koyulaştırılmış
 * hali değil — koyu zeminde okunabilirlik için ayrıca ayarlandı).
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

export const typography = {
  screenTitle: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700" as const },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 0.4 },
};

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
  typography: typeof typography;
  shadow: typeof shadow;
};

export const lightTheme: Theme = { mode: "light", colors: lightColors, spacing, radius, typography, shadow };
export const darkTheme: Theme = { mode: "dark", colors: darkColors, spacing, radius, typography, shadow };
