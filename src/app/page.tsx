import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/lib/i18n/copy";
import { readSiteLocaleCookie } from "@/lib/site-locales";
import {
  AboutSection,
  ContactSection,
  FaqSection,
  FeaturesSection,
  HeroSection,
  MediaSection,
  MobileAppSection,
  PlatformSection,
  PricingSection,
  PurchaseSection,
  ReferencesSection,
  SiteFooter,
  SiteHeader,
  StepsSection,
} from "@/components/site/sections";
import { SiteAppBanner } from "@/components/site/app-banner";
import { BRAND } from "@/lib/brand";
import { SITE_FAQ } from "@/lib/site-content";

export const dynamic = "force-dynamic";

/**
 * GİRİŞ ÖNCESİ KURUMSAL SİTE. Bu dosya BİLEREK sadece bölümleri SIRALAR —
 * metinler locale sözlüğünden (`src/lib/site-locales/`) gelir ve her bölüme
 * `c` prop'uyla verilir. Dil, `nevii_lang` cookie'sinden okunur (tr/en/de/fr/es).
 * JSON-LD yapısal verisi SSS bölümünden OTOMATİK üretilir; OG/Twitter kartı
 * (`opengraph-image.tsx` konvansiyonu, harici asset yok).
 */
const OG_LOCALE: Record<string, string> = { tr: "tr_TR", en: "en_US", de: "de_DE", fr: "fr_FR", es: "es_ES" };
export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const { resolveSiteContent } = await import("@/lib/platform/site-content-overrides");
  const c = await resolveSiteContent(readSiteLocaleCookie(jar.get(LOCALE_COOKIE)?.value));
  // iOS akıllı bant: yalnız App Store bağlantısındaki sayısal kimlikten türetilir.
  const { appStoreIdFromUrl, resolveMobileAppLinks } = await import("@/lib/platform/site-mobile-apps");
  const links = await resolveMobileAppLinks();
  const appId = links.appStoreUrl ? appStoreIdFromUrl(links.appStoreUrl) : null;
  return {
    title: c.meta.title,
    description: c.meta.description,
    alternates: { canonical: "/" },
    openGraph: {
      title: c.meta.title,
      description: c.meta.description,
      type: "website",
      locale: OG_LOCALE[c.locale] ?? "tr_TR",
      siteName: BRAND.name,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: BRAND.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: c.meta.title,
      description: c.meta.description,
      images: ["/opengraph-image"],
    },
    ...(appId ? { other: { "apple-itunes-app": `app-id=${appId}` } } : {}),
  };
}

function siteJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: BRAND.description,
      inLanguage: "tr-TR",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: SITE_FAQ.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
  ];
}

export default async function LandingPage() {
  const session = await getSessionContext();
  if (session) {
    redirect(homePathForRole(session.role));
  }
  return <LandingContent />;
}

async function LandingContent() {
  const jar = await cookies();
  const { resolveSiteContent } = await import("@/lib/platform/site-content-overrides");
  const c = await resolveSiteContent(readSiteLocaleCookie(jar.get(LOCALE_COOKIE)?.value));
  // Bant yalnız uygulama tanımlıysa (şema veya mağaza bağlantısı) anlamlıdır.
  const { getAppBannerConfig } = await import("@/lib/platform/site-mobile-apps");
  const banner = await getAppBannerConfig();
  return (
    // Bu ekran her zaman AÇIK temadır (cihaz koyu temada olsa bile) — bkz.
    // sections.tsx tema notu; logo beyaz güvenli alan kartında durur.
    <div className="min-h-screen bg-white text-slate-900">
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-amber-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {c.skip}
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }}
      />
      <SiteHeader c={c} />
      <main id="icerik">
        <HeroSection c={c} />
        <AboutSection c={c} />
        <StepsSection />
        <FeaturesSection c={c} />
        <PlatformSection c={c} />
        <ReferencesSection c={c} />
        <PricingSection c={c} />
        <PurchaseSection c={c} />
        <MobileAppSection c={c} />
        <MediaSection c={c} />
        <FaqSection c={c} />
        <ContactSection c={c} />
      </main>
      <SiteFooter c={c} />
      {banner ? (
        <SiteAppBanner
          {...banner}
          title={c.mobileApp.title}
          subtitle="Bildirimler ve tek dokunuşla işlemler"
          openLabel={c.mobileApp.openInApp}
          dismissLabel={c.mobileApp.dismiss}
        />
      ) : null}
    </div>
  );
}
