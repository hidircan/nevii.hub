import { deContent } from "./de";
import { enContent } from "./en";
import { esContent } from "./es";
import { frContent } from "./fr";
import { trContent } from "./tr";
import type { SiteContent, SiteLocale } from "./types";

export type { SiteContent, SiteLocale };
export { SITE_LOCALES, normalizeSiteLocale, readSiteLocaleCookie } from "./types";

const ALL: Record<SiteLocale, SiteContent> = {
  tr: trContent,
  en: enContent,
  de: deContent,
  fr: frContent,
  es: esContent,
};

export function getSiteContent(locale: SiteLocale): SiteContent {
  return ALL[locale] ?? trContent;
}
