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
} from "@/components/site/sections";
import { SiteAppBanner } from "@/components/site/app-banner";

export const dynamic = "force-dynamic";

/**
 * GİRİŞ ÖNCESİ KURUMSAL SİTE. Bu dosya BİLEREK sadece bölümleri SIRALAR —
 * metinler locale sözlüğünden (`src/lib/site-locales/`) gelir ve her bölüme
 * `c` prop'uyla verilir. Dil, `nevii_lang` cookie'sinden okunur (tr/en/de/fr/es).
 */
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
    ...(appId ? { other: { "apple-itunes-app": `app-id=${appId}` } } : {}),
  };
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
  const { getSiteMobileApps, resolveMobileAppLinks } = await import("@/lib/platform/site-mobile-apps");
  const [site, resolved] = await Promise.all([getSiteMobileApps(), resolveMobileAppLinks()]);
  const scheme = process.env.MOBILE_APP_SCHEME || undefined;
  const bannerApp = site.appStoreVisible ? resolved.appStoreUrl : undefined;
  const bannerPlay = site.playVisible ? resolved.playStoreUrl : undefined;
  const bannerLive = Boolean(scheme || bannerApp || bannerPlay);
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
      <SiteHeader c={c} />
      <main id="icerik">
        <HeroSection c={c} />
        <AboutSection c={c} />
        <FeaturesSection c={c} />
        <PlatformSection c={c} />
        <PricingSection c={c} />
        <PurchaseSection c={c} />
        <MobileAppSection c={c} />
        <MediaSection c={c} />
        <FaqSection c={c} />
        <ReferencesSection c={c} />
        <ContactSection c={c} />
      </main>
      <SiteFooter c={c} />
      {bannerLive ? (
        <SiteAppBanner
          scheme={scheme}
          appStoreUrl={bannerApp}
          playStoreUrl={bannerPlay}
          title={c.mobileApp.title}
          openLabel={c.mobileApp.openInApp}
          dismissLabel={c.mobileApp.dismiss}
        />
      ) : null}
    </div>
  );
}
