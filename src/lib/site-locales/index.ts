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

const STATS_COPY: Record<SiteLocale, SiteContent["stats"]> = {
  tr: { title: "NeviiHub'ı bugün kullananlar", description: "Toplu ve anonim canlı sayılar; saatte bir güncellenir.", teachers: "öğretmen", students: "öğrenci", parents: "veli", admins: "yönetici", branches: "şube" },
  en: { title: "Using NeviiHub today", description: "Aggregated, anonymous live figures, updated hourly.", teachers: "teachers", students: "students", parents: "parents", admins: "administrators", branches: "branches" },
  de: { title: "NeviiHub heute im Einsatz", description: "Zusammengefasste, anonyme Live-Zahlen, stündlich aktualisiert.", teachers: "Lehrkräfte", students: "Lernende", parents: "Eltern", admins: "Verwaltung", branches: "Standorte" },
  fr: { title: "NeviiHub aujourd'hui", description: "Chiffres agrégés et anonymes, mis à jour chaque heure.", teachers: "enseignants", students: "élèves", parents: "parents", admins: "administrateurs", branches: "sites" },
  es: { title: "NeviiHub hoy", description: "Cifras agregadas y anónimas, actualizadas cada hora.", teachers: "docentes", students: "estudiantes", parents: "familias", admins: "administradores", branches: "sedes" },
};

function withShared(locale: SiteLocaleContent): SiteContent {
  const { email, phone, address, mapEmbedUrl } = SITE_CONTACT;
  return {
    ...locale,
    about: { ...locale.about, note: SITE_ABOUT_NOTE },
    start: SITE_START,
    stats: STATS_COPY[locale.locale],
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
