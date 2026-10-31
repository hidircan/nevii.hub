import type {
  FaqItem,
  FeatureGroup,
  MediaItem,
  NavItem,
  PlatformSurface,
  PurchaseStep,
  ReferenceItem,
  StepItem,
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

/** Dile göre çevrilen metinler (`tr.ts`, `en.ts`…). */
export type SiteLocaleContent = {
  locale: SiteLocale;
  meta: { title: string; description: string };
  skip: string;
  header: { login: string; languageLabel: string; demo: string };
  nav: NavItem[];
  hero: { headline: string; subline: string; login: string; trial: string; tour: string; highlights: string[] };
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
    demoTitle: string;
    demoCta: string;
    follow: string;
    soon: string;
    mapTitle: string;
  };
  footer: { rights: string };
};

/**
 * Dile bağlı olmayan varsayılanlar (`site-content.ts`); NeviiOS Site Ayarları
 * bunları dil bazında ezebilir. `links` değeri null ise hedef gizli bir bölümü
 * gösterdiği için düğme çıkmaz.
 */
export type SiteSharedContent = {
  about: { title: string; description: string; note: string };
  start: { eyebrow: string; title: string };
  stats: { title: string; description: string; teachers: string; students: string; parents: string; admins: string; branches: string };
  startSteps: StepItem[];
  referenceItems: ReferenceItem[];
  heroShowcase: { imageUrl: string; imageAlt: string; caption: string } | null;
  links: Record<SiteLinkKey, string | null>;
  contactInfo: { email?: string; phone?: string; address?: string; mapEmbedUrl?: string };
};

export type SiteLinkKey = "headerDemo" | "headerLogin" | "heroLogin" | "heroTrial" | "heroTour" | "contactTrial" | "pricingPlaceholder" | "purchaseCta";

/** Bileşenler metni YALNIZCA buradan alır. */
export type SiteContent = Omit<SiteLocaleContent, "about"> & SiteSharedContent;
