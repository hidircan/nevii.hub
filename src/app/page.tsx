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
} from "@/components/site/sections";

export const dynamic = "force-dynamic";

/**
 * P1 (2026-09-05) — GİRİŞ ÖNCESİ SAYFA artık yalnız bir giriş ekranı değil,
 * ileride tam bir kurumsal siteye büyüyecek AÇIK/ferah bir temelin ta
 * kendisidir. Bu dosya BİLEREK sadece bölümleri SIRALAR — her bölüm kendi
 * bileşenidir (`src/components/site/sections.tsx`) ve içeriği
 * `src/lib/site-content.ts`ten gelir. Yeni bölüm eklemek/sıra değiştirmek
 * sayfayı yeniden yazmayı gerektirmez.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — Müzik kurumları için yönetim platformu`,
  description: BRAND.description,
  alternates: { canonical: "/" },
};

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
      <SiteHeader />
      <main id="icerik">
        <HeroSection />
        <AboutSection />
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
