import type {
  FaqItem,
  FeatureGroup,
  MediaItem,
  NavItem,
  PlatformSurface,
  PurchaseStep,
} from "../site-content";

/**
 * Herkese açık kurumsal sitenin dilleri. Uygulama içi `AppLocale` (tr/en)
 * AYRI kalır — bu liste yalnız landing içeriğini kapsar. Bilinmeyen değer
 * güvenli şekilde Türkçe'ye düşer.
 */
export type SiteLocale = "tr" | "en" | "de" | "fr" | "es";

export const SITE_LOCALES: { code: SiteLocale; label: string }[] = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

export function normalizeSiteLocale(value: unknown): SiteLocale {
  return value === "en" || value === "de" || value === "fr" || value === "es" ? value : "tr";
}

/** `nevii_lang` cookie'sinden site dilini okur (uygulama cookie'siyle AYNI anahtar). */
export function readSiteLocaleCookie(value: string | undefined | null): SiteLocale {
  return normalizeSiteLocale(value);
}

/** Tek bölümün tüm metinleri — bileşenler metni YALNIZCA buradan alır. */
export type SiteContent = {
  locale: SiteLocale;
  meta: { title: string; description: string };
  skip: string;
  header: { login: string; languageLabel: string };
  nav: NavItem[];
  hero: { headline: string; subline: string; login: string; trial: string; tour: string };
  about: { title: string; description: string };
  features: { title: string; description: string };
  groups: FeatureGroup[];
  platform: { title: string; description: string };
  surfaces: PlatformSurface[];
  references: { title: string; empty: string; story: string };
  pricing: { title: string; description: string };
  pricingPlaceholder: { title: string; description: string; cta: string };
  pricingChrome: {
    periodLabel: string;
    monthly: string;
    yearly: string;
    perMonth: string;
    perYear: string;
    /** `{equiv}` yer tutuculudur. */
    yearlyNote: string;
    /** `{pct}` yer tutuculudur. */
    savings: string;
    sandboxZero: string;
    customQuote: string;
    notApproved: string;
    unlimited: string;
    students: string;
    users: string;
    branches: string;
    /** `{n}` yer tutuculudur. */
    moreModules: string;
    buy: string;
    quote: string;
    demoNote: string;
    trialTeaser: string;
    trialCta: string;
  };
  purchase: { title: string; description: string; cta: string };
  mobileApp: { title: string; description: string; appStore: string; play: string; soon: string; openInApp: string; dismiss: string };
  steps: PurchaseStep[];
  media: { title: string; description: string };
  mediaItems: MediaItem[];
  faq: { title: string; description: string };
  faqItems: FaqItem[];
  contact: {
    title: string;
    description: string;
    phone: string;
    email: string;
    address: string;
    pending: string;
    follow: string;
    soon: string;
    mapTitle: string;
  };
  footer: { rights: string };
};
