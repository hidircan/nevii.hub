import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";
import {
  AboutSection,
  ContactSection,
  FaqSection,
  FeaturesSection,
  HeroSection,
  MediaSection,
  PlatformSection,
  PricingSection,
  ReferencesSection,
  SiteFooter,
  SiteHeader,
  StepsSection,
} from "@/components/site/sections";
import { SITE_FAQ } from "@/lib/site-content";

export const dynamic = "force-dynamic";

/**
 * P1 (2026-09-05) — GİRİŞ ÖNCESİ SAYFA artık yalnız bir giriş ekranı değil,
 * ileride tam bir kurumsal siteye büyüyecek AÇIK/ferah bir temelin ta
 * kendisidir. Bu dosya BİLEREK sadece bölümleri SIRALAR — her bölüm kendi
 * bileşenidir (`src/components/site/sections.tsx`) ve içeriği
 * `src/lib/site-content.ts`ten gelir. Yeni bölüm eklemek/sıra değiştirmek
 * sayfayı yeniden yazmayı gerektirmez.
 *
 * 10. tur iş #3 — başlık ≤60 karakter (pazarlama 07), JSON-LD yapısal verisi
 * (SSS bölümünden OTOMATİK üretilir — içerikle asla ayrışmaz), OG/Twitter
 * kartı (`opengraph-image.tsx` konvansiyonu, harici asset yok).
 */
export const metadata: Metadata = {
  title: "NeviiHub — Müzik Okulları için Yönetim Platformu",
  description: BRAND.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "NeviiHub — Müzik Okulları için Yönetim Platformu",
    description: BRAND.description,
    type: "website",
    locale: "tr_TR",
    siteName: BRAND.name,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NeviiHub — Müzik Okulları için Yönetim Platformu",
    description: BRAND.description,
    images: ["/opengraph-image"],
  },
};

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

  return (
    // Bu ekran her zaman AÇIK temadır (cihaz koyu temada olsa bile) — bkz.
    // sections.tsx tema notu; logo beyaz güvenli alan kartında durur.
    <div className="min-h-screen bg-white text-slate-900">
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-amber-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        İçeriğe geç
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }}
      />
      <SiteHeader />
      <main id="icerik">
        <HeroSection />
        <AboutSection />
        <StepsSection />
        <FeaturesSection />
        <PlatformSection />
        <ReferencesSection />
        <PricingSection />
        <MediaSection />
        <FaqSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
