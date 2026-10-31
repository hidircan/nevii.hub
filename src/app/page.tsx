import { Fragment, type CSSProperties } from "react";
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
  StatsSection,
  SiteFooter,
  SiteHeader,
  StepsSection,
} from "@/components/site/sections";
import { SiteAppBanner } from "@/components/site/app-banner";
import { PointerGlow } from "@/components/site/pointer-glow";
import { BlogTeaserSection, ModulesSection, SectorsSection, SetupSection, TailorSection, TourSection, TrustSection } from "@/components/site/home-sections";
import { BRAND } from "@/lib/brand";
import { getPlatformBrand } from "@/lib/platform/branding";
import { resolveSitePage, type SiteSectionId } from "@/lib/platform/site-page";
import type { SiteContent } from "@/lib/site-locales";

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
  const { c } = await resolveSitePage(readSiteLocaleCookie(jar.get(LOCALE_COOKIE)?.value));
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

/** İçerik NeviiOS'tan düzenlenebildiği için `<` kaçırılır: `</script>` etiketi kapatamaz. */
function siteJsonLd(c: SiteContent, sections: SiteSectionId[]) {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: BRAND.description,
      inLanguage: "tr-TR",
    },
    // SSS yapısal verisi yalnız bölüm sayfada görünürken üretilir.
    ...(sections.includes("faq")
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: c.faqItems.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          },
        ]
      : []),
  ];
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ onizleme?: string }> }) {
  const session = await getSessionContext();
  // Platform sahibi Site Ayarları'ndan yayındaki sayfayı açabilir; diğer herkes evine gider.
  const preview = session?.role === "HYPER_ADMIN" && (await searchParams).onizleme === "1";
  if (session && !preview) {
    redirect(homePathForRole(session.role));
  }
  return <LandingContent />;
}

async function LandingContent() {
  const jar = await cookies();
  const { c, sections } = await resolveSitePage(readSiteLocaleCookie(jar.get(LOCALE_COOKIE)?.value));
  // Bant yalnız uygulama tanımlıysa (şema veya mağaza bağlantısı) anlamlıdır.
  const { getAppBannerConfig } = await import("@/lib/platform/site-mobile-apps");
  const [banner, brand] = await Promise.all([getAppBannerConfig(), getPlatformBrand()]);
  const views: Record<SiteSectionId, React.ReactNode> = {
    about: <AboutSection c={c} />,
    stats: <StatsSection c={c} />,
    tour: <TourSection />,
    // Türkçede ayrıntı sayfalarına giden tanıtım bölümleri; diğer dillerde kısa çevrili bölümler.
    start: c.locale === "tr" ? <SetupSection /> : <StepsSection c={c} />,
    features: c.locale === "tr" ? <ModulesSection /> : <FeaturesSection c={c} />,
    sectors: <SectorsSection />,
    tailor: <TailorSection />,
    trust: <TrustSection />,
    blog: <BlogTeaserSection />,
    platform: <PlatformSection c={c} />,
    references: <ReferencesSection c={c} />,
    pricing: <PricingSection c={c} />,
    purchase: <PurchaseSection c={c} />,
    mobile: <MobileAppSection c={c} />,
    media: <MediaSection c={c} />,
    faq: <FaqSection c={c} />,
    contact: <ContactSection c={c} />,
  };
  return (
    // Bu ekran her zaman AÇIK temadır (cihaz koyu temada olsa bile) — bkz.
    // sections.tsx tema notu; logo beyaz güvenli alan kartında durur.
    <div className="nh-site min-h-screen bg-white text-slate-900" style={{ "--text-primary": "#0f172a" } as CSSProperties}>
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-amber-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {c.skip}
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: siteJsonLd(c, sections) }}
      />
      <PointerGlow />
      <SiteHeader c={c} />
      <main id="icerik">
        <HeroSection c={c} />
        {sections.map((id) => (
          <Fragment key={id}>{views[id]}</Fragment>
        ))}
      </main>
      <SiteFooter c={c} />
      {banner ? (
        <SiteAppBanner
          {...banner}
          iconUrl={brand.appleIconUrl}
          title={c.mobileApp.title}
          subtitle="Bildirimler ve tek dokunuşla işlemler"
          openLabel={c.mobileApp.openInApp}
          dismissLabel={c.mobileApp.dismiss}
        />
      ) : null}
    </div>
  );
}
