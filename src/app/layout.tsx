import type { Metadata } from "next";
import { Gloock, Inter, Noto_Sans, Playfair_Display, Roboto_Serif } from "next/font/google";
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
 *
 * P0 UAT (2026-09-07) — Roboto Serif ve Playfair Display eskiden
 * `next/font/local` ile HAM TTF variable font olarak yükleniyordu. ÖLÇÜLDÜ:
 * her soğuk sayfa açılışında 7 font dosyası, toplam 4.747 KB iniyordu ve
 * bunun 4.311 KB'ı yalnız bu iki ailenin TTF'leriydi (RobotoSerif 1.954 KB +
 * italik 2.357 KB). Karşılaştırma: aynı sayfada JS 179 KB, CSS 21 KB. Yani
 * TÜM ekranlarda ilk açılışın baskın maliyeti fontlardı — kullanıcının
 * "her ekran ilk açılışta yavaş" şikâyetinin ortak nedeni.
 *
 * `next/font/google` AYNI şekilde build-time self-host eder (çalışma
 * zamanında Google'a istek YOK — yukarıdaki gerekçe korunur) ama ek olarak
 * latin alt kümesine indirger ve woff2'ye çevirir. Zaten bu dosyada
 * Inter/Noto Sans o yoldan geliyor ve 35-84 KB'lar.
 */
const robotoSerif = Roboto_Serif({
  subsets: ["latin", "latin-ext"],
  variable: "--font-roboto-serif",
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playfair-display",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const gloock = Gloock({ subsets: ["latin"], weight: "400", variable: "--font-gloock", display: "swap" });
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
      className={`${robotoSerif.variable} ${playfairDisplay.variable} ${inter.variable} ${gloock.variable} ${notoSans.variable} h-full antialiased`}
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
