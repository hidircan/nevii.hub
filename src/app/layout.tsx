import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter, Noto_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import {
  THEME_PROFILE_COOKIE,
  FONT_COOKIE,
  DENSITY_COOKIE,
  normalizeThemeProfile,
  normalizeFontChoice,
  normalizeDensity,
} from "@/lib/theme";
import { BRAND } from "@/lib/brand";
import { AssistantProvider } from "@/components/ai/assistant-context";
import { GlobalAssistant } from "@/components/ai/global-assistant";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

/**
 * Dört font seçeneği (bkz. src/lib/theme.ts FontChoice) — hepsi burada
 * `next/font` ile build-time'da self-host edilir (çalışma zamanında Google'a
 * istek YOK). Her biri kendi CSS değişkenine yazılır; hangi değişkenin
 * `--font-sans`/`--font-display` olarak KULLANILACAĞI globals.css'teki
 * `[data-font="..."]` bloklarında seçilir — burada yalnız yükleme var.
 */
const robotoSerif = localFont({
  src: [
    {
      path: "../../public/fonts/roboto-serif/RobotoSerif-VariableFont_GRAD,opsz,wdth,wght.ttf",
      style: "normal",
      weight: "400 900",
    },
    {
      path: "../../public/fonts/roboto-serif/RobotoSerif-Italic-VariableFont_GRAD,opsz,wdth,wght.ttf",
      style: "italic",
      weight: "400 900",
    },
  ],
  variable: "--font-roboto-serif",
  display: "swap",
});

const playfairDisplay = localFont({
  src: [
    {
      path: "../../public/fonts/playfair-display/PlayfairDisplay-VariableFont_wght.ttf",
      style: "normal",
      weight: "400 900",
    },
    {
      path: "../../public/fonts/playfair-display/PlayfairDisplay-Italic-VariableFont_wght.ttf",
      style: "italic",
      weight: "400 900",
    },
  ],
  variable: "--font-playfair-display",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", display: "swap" });

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
  // Sekme simgesi (favicon) — Next.js'in `src/app/icon.png` dosya
  // kuralıyla otomatik sunulur; burada AYRICA `icons.icon` tanımlamak
  // aynı URL'ye ikinci, çakışan/gereksiz bir <link rel="icon"> ekliyordu.
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    // ponytail: no approved Nevii Hub og-image asset yet — omit rather than
    // reference the stale Maestron one. Add back once a real asset exists.
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  // P1 (2026-09-05) — giriş ÖNCESİ (oturumsuz) sayfalarda AI asistan balonu
  // gösterilmez: kurumsal karşılama sayfasında bağlamı yoktur ve API'ye
  // yaptığı çağrılar konsolda 401 üretiyordu. Kurulum çerezleriyle AYNI
  // yerden, ek bir istek olmadan (yalnız erişim çerezinin VARLIĞINA bakarak)
  // karar verilir — bu bir YETKİ kontrolü DEĞİL, yalnız render kararıdır;
  // gerçek yetki her istekte sunucuda ayrıca doğrulanır.
  const hasSessionCookie = !!jar.get(ACCESS_COOKIE)?.value;
  const themeProfile = normalizeThemeProfile(jar.get(THEME_PROFILE_COOKIE)?.value);
  const font = normalizeFontChoice(jar.get(FONT_COOKIE)?.value);
  const density = normalizeDensity(jar.get(DENSITY_COOKIE)?.value);

  return (
    <html
      lang="tr"
      className={`${robotoSerif.variable} ${playfairDisplay.variable} ${inter.variable} ${notoSans.variable} h-full antialiased`}
      data-theme-profile={themeProfile}
      data-font={font}
      data-density={density}
    >
      <body className="min-h-full">
        <AssistantProvider>
          {children}
          {hasSessionCookie ? <GlobalAssistant /> : null}
        </AssistantProvider>
      </body>
    </html>
  );
}
