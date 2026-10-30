import {
  SITE_ABOUT_NOTE,
  SITE_CONTACT,
  SITE_HERO_SHOWCASE,
  SITE_REFERENCES,
  SITE_START,
  SITE_STEPS,
} from "../site-content";
import { deContent } from "./de";
import { enContent } from "./en";
import { esContent } from "./es";
import { frContent } from "./fr";
import { trContent } from "./tr";
import type { SiteContent, SiteLinkKey, SiteLocale, SiteLocaleContent } from "./types";

export type { SiteContent, SiteLinkKey, SiteLocale };
export { SITE_LOCALES, normalizeSiteLocale, readSiteLocaleCookie } from "./types";

export const SITE_DEFAULT_LINKS: Record<SiteLinkKey, string> = {
  headerDemo: "#iletisim",
  headerLogin: "/login",
  heroLogin: "/login",
  heroTrial: "/deneme",
  heroTour: "#platform",
  contactTrial: "/deneme",
  pricingPlaceholder: "#iletisim",
  purchaseCta: "#fiyatlandirma",
};

function withShared(locale: SiteLocaleContent): SiteContent {
  const { email, phone, address, mapEmbedUrl } = SITE_CONTACT;
  return {
    ...locale,
    about: { ...locale.about, note: SITE_ABOUT_NOTE },
    start: SITE_START,
    startSteps: SITE_STEPS,
    referenceItems: SITE_REFERENCES,
    heroShowcase: SITE_HERO_SHOWCASE,
    links: SITE_DEFAULT_LINKS,
    contactInfo: { email, phone, address, mapEmbedUrl },
  };
}

const ALL: Record<SiteLocale, SiteContent> = {
  tr: withShared(trContent),
  en: withShared(enContent),
  de: withShared(deContent),
  fr: withShared(frContent),
  es: withShared(esContent),
};

export function getSiteContent(locale: SiteLocale): SiteContent {
  return ALL[locale] ?? ALL.tr;
}
