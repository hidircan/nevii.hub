/**
 * GİRİŞ ÖNCESİ KURUMSAL SİTE BÖLÜMLERİ (10. tur redesign; i18n + canlı katalog).
 *
 * Her bölüm bağımsız, yeniden kullanılabilir ve responsive bir bileşendir;
 * sayfa (`src/app/page.tsx`) yalnızca bunları SIRALAR.
 *
 * TEMA: bu ekran BİLİNÇLİ olarak her zaman AÇIK temadır — cihaz koyu temada
 * olsa bile renkler sabittir (`var(--color-*)` KULLANILMAZ).
 *
 * İÇERİK: metinler `c: SiteContent` prop'undan gelir (`src/lib/site-locales/`, tr/en/de/fr/es
 * + NeviiOS override). Sabit listeler `src/lib/site-content.ts`ten (SSS, adımlar, sosyal,
 * referans). Gerçek verisi olmayan bölümler UYDURMA veri göstermek yerine dürüst bir
 * "hazırlanıyor / bize ulaşın" durumuna düşer.
 */
import Link from "@/components/link";
import {
  Check,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Users,
  Phone,
  MapPin,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { PlatformLogo } from "@/components/platform-logo";
import { SITE_CONTACT } from "@/lib/site-content";
import { SITE_LOCALES, type SiteContent, type SiteLocale } from "@/lib/site-locales";
import { getSiteSocial, SITE_SOCIAL_LABELS, type SiteSocialNetwork } from "@/lib/platform/site-social";
import type { PricingPlanView } from "./pricing-plans";
import { Reveal } from "./reveal";
import { ProductStage, SceneBody, STORY_SCENES } from "./showcase-panel";
import type { CSSProperties } from "react";

/** Odak halkası her etkileşimli öğede AYNI — klavye kullanıcısı nerede olduğunu her zaman görür. */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** Sosyal ağ marka ikonları — tek renk (currentColor), 24'lük ızgara, metinle yan yana okunur. */
function SocialIcon({ network, className = "h-4 w-4" }: { network: string; className?: string }) {
  const common = { "aria-hidden": true as const, viewBox: "0 0 24 24", className: `shrink-0 ${className}` };
  switch (network) {
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path d="M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.4-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.7.3c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.8 9.1.8 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.6.3 7.6.3s4.6 0 7.7-.4c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.8 15.1V8.4l6.2 3.4-6.2 3.3z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="5.5" cy="5.5" r="2.2" />
          <rect x="3.8" y="9" width="3.4" height="11.5" rx="1" />
          <path d="M11 9.2h3.2v1.9c.7-1.2 2-2.1 3.7-2.1 2.7 0 4.1 1.7 4.1 4.7v6.8h-3.4v-5.8c0-1.6-.7-2.5-2-2.5-1.4 0-2.2 1-2.2 2.5v5.8H11V9.2z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="currentColor">
          <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.4L2 3h6.4l4.4 5.7 4.9-5.7zm-1.1 16.1h1.7L7.4 4.8H5.6l11.1 14.3z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.5 3c.4 2.3 1.9 3.8 4.2 4v3.1c-1.6 0-3-.5-4.2-1.3v6.1c0 3.6-2.6 6.1-6 6.1-3.3 0-5.9-2.5-5.9-5.7 0-3.3 2.7-5.8 6.1-5.8.3 0 .7 0 1 .1v3.2c-.3-.1-.7-.2-1-.2-1.6 0-2.9 1.2-2.9 2.7 0 1.5 1.2 2.7 2.8 2.7 1.7 0 2.9-1.3 2.9-3.1V3h3z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Mağaza marka ikonları — tek renk (currentColor), simple-icons CC0 yolları gömülü. */
function StoreIcon({ store }: { store: "apple" | "play" }) {
  if (store === "apple") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
      <path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  );
}

/** Görünen etiket → ikon anahtarı. */
function socialKey(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("youtube")) return "youtube";
  if (l.includes("instagram")) return "instagram";
  if (l.includes("linkedin")) return "linkedin";
  if (label === "X") return "x";
  if (l.includes("tiktok")) return "tiktok";
  return "";
}

/** Koyu zeminli İletişim bölümü için: halka açık amber, ofset koyu zemine uyar. */
const FOCUS_RING_DARK =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800";

const PORTAL_ICONS = [LayoutDashboard, GraduationCap, Users] as const;

function Section({
  id,
  children,
  className = "",
  style,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section id={id} style={style} className={`scroll-mt-32 px-6 py-16 sm:py-20 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children, tone = "light" }: { children: string; tone?: "light" | "dark" }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.14em] ${
        tone === "dark" ? "text-amber-400" : "text-amber-700"
      }`}
    >
      {children}
    </p>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 text-base leading-relaxed text-slate-600">{description}</p> : null}
    </Reveal>
  );
}

/** Beyaz güvenli alan — cihaz/tema koyu olsa da marka logosu her zaman okunur. */
export function SiteLogo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
      <PlatformLogo height={size} alt={BRAND.name} />
    </span>
  );
}

/**
 * Dil seçici — JS'siz `<details>` menü; seçim `/api/site-locale` üzerinden
 * cookie'ye yazılır ve aynı sayfaya dönülür.
 */
export function LanguageSwitcher({ locale, label, compact }: { locale: SiteLocale; label: string; compact?: boolean }) {
  const current = SITE_LOCALES.find((l) => l.code === locale) ?? SITE_LOCALES[0];
  return (
    <details className={`relative shrink-0 ${compact ? "" : ""}`}>
      <summary
        aria-label={label}
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 ${FOCUS_RING} ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-[13px]"}`}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M1.8 8h12.4M8 1.8c-3.6 3.4-3.6 9 0 12.4M8 1.8c3.6 3.4 3.6 9 0 12.4" />
        </svg>
        {current.label}
        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </summary>
      <ul className="absolute right-0 z-40 mt-1.5 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
        {SITE_LOCALES.map((l) => (
          <li key={l.code}>
            <a
              href={`/api/site-locale?lang=${l.code}&next=${encodeURIComponent("/")}`}
              aria-current={l.code === locale ? "true" : undefined}
              className={`block px-3.5 py-2 text-[13px] hover:bg-slate-50 ${l.code === locale ? "font-bold text-slate-900" : "text-slate-700"}`}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SiteHeader({ c }: { c: SiteContent }) {
  return (
    <header id="ust" className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      {/* Yüzen çubuk; kaydırdıkça gölge + opaklık (globals.css nh-header-bar, saf CSS). */}
      <div className="nh-header-bar mx-auto max-w-6xl rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <Link href="/" className={`flex shrink-0 items-center gap-2.5 rounded-lg ${FOCUS_RING}`}>
            <SiteLogo size={30} />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">{BRAND.shortName}</span>
          </Link>
          <nav aria-label="Ana menü" className="ml-6 hidden min-w-0 flex-1 items-center justify-center gap-0 xl:flex">
            {/* Logo zaten ana sayfaya döner; geniş menüde "Ana Sayfa" tekrarlanmaz. */}
            {c.nav.filter((item) => item.href !== "#ust" && item.href !== "/").map((item, i) => (
              <a
                key={i}
                href={item.href}
                className={`nh-navlink relative whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-900 ${FOCUS_RING}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:block">
              <LanguageSwitcher locale={c.locale} label={c.header.languageLabel} />
            </span>
            {c.links.headerDemo ? (
              <a
                href={c.links.headerDemo}
                className={`hidden rounded-full px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50 sm:inline-block ${FOCUS_RING}`}
              >
                {c.header.demo}
              </a>
            ) : null}
            <Link
              href={c.links.headerLogin ?? "/login"}
              className={`shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 ${FOCUS_RING}`}
            >
              {c.header.login}
            </Link>
          </div>
        </div>
        {/* xl altında menü ayrı satırda, yatay kaydırılabilir — JS'siz, erişilebilir. */}
        <nav aria-label="Ana menü (mobil)" className="flex items-center gap-1 overflow-x-auto border-t border-slate-200/60 px-3 py-1.5 xl:hidden">
          <span className="shrink-0 pr-1 sm:hidden">
            <LanguageSwitcher locale={c.locale} label={c.header.languageLabel} compact />
          </span>
          {c.nav.map((item, i) => (
            <a
              key={i}
              href={item.href}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function HeroSection({ c }: { c: SiteContent }) {
  return (
    <section className="relative overflow-hidden px-6 pb-14 pt-14 sm:pb-20 sm:pt-20">
      {/* Yumuşak, hareketsiz gradyan — otomatik oynayan medya/ağır animasyon YOK. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_0%,#fef3c7_0%,#ffffff_60%)]"
      />
      <div className="mx-auto max-w-3xl text-center">
        <p className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          <PlatformLogo height={64} />
          <span className="text-[2.75rem] font-extrabold normal-case leading-none tracking-tight text-slate-900 sm:text-5xl">
            {BRAND.shortName}
          </span>
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">{c.hero.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {c.hero.subline}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={c.links.heroLogin ?? "/login"}
            className={`rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 ${FOCUS_RING}`}
          >
            {c.hero.login}
          </Link>
          <a
            href={c.links.heroTrial ?? "/deneme"}
            className={`rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS_RING}`}
          >
            {c.hero.trial}
          </a>
        </div>
        {c.links.heroTour ? (
          <p className="mt-4 text-sm">
            <a href={c.links.heroTour} className={`font-medium text-amber-700 hover:text-amber-800 ${FOCUS_RING}`}>
              {c.hero.tour}
            </a>
          </p>
        ) : null}
        <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-700">
          {c.hero.highlights.map((h, i) => (
            <li key={i} className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-amber-600" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
      </div>
      {/* Gerçek ürün ekranı — tanımlıysa gösterilir, yoksa hero görselsiz kalır. */}
      {c.heroShowcase ? (
        <Reveal delayMs={150} className="mx-auto mt-12 max-w-4xl">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.heroShowcase.imageUrl}
              alt={c.heroShowcase.imageAlt}
              width={1200}
              height={750}
              className="w-full rounded-2xl shadow-xl shadow-amber-900/10 ring-1 ring-slate-900/10"
            />
            <figcaption className="mt-3 text-center text-sm text-slate-500">{c.heroShowcase.caption}</figcaption>
          </figure>
        </Reveal>
      ) : (
        <ProductStage modules={c.groups.map((g) => g.title)} />
      )}
    </section>
  );
}

export function AboutSection({ c }: { c: SiteContent }) {
  return (
    <Section id="hakkimizda" className="bg-white">
      <SectionHeading title={c.about.title} description={c.about.description} />
      <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-slate-500">{c.about.note}</p>
    </Section>
  );
}

/** Toplu, anonim canlı sayılar. Veri okunamazsa veya henüz yoksa bölüm hiç çıkmaz. */
export async function StatsSection({ c }: { c: SiteContent }) {
  const { getSiteStats } = await import("@/lib/platform/site-stats");
  const stats = await getSiteStats();
  if (!stats) return null;
  const items = [
    { value: stats.students, label: c.stats.students },
    { value: stats.teachers, label: c.stats.teachers },
    { value: stats.parents, label: c.stats.parents },
    { value: stats.admins, label: c.stats.admins },
    { value: stats.branches, label: c.stats.branches },
  ].filter((item) => item.value > 0);
  return (
    <Section
      id="rakamlar"
      className="relative overflow-hidden bg-[#4a3208]"
      style={{ "--text-primary": "#ffffff" } as CSSProperties}
    >
      <div
        aria-hidden
        className="nh-drift pointer-events-none absolute -right-1/4 -top-1/2 h-[160%] w-[70%] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #d97706, transparent)" }}
      />
      <Reveal className="relative text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.stats.title}</h2>
        <p className="mt-3 text-sm text-white/70">{c.stats.description}</p>
      </Reveal>
      <ul className="relative mt-10 flex flex-wrap justify-center gap-x-12 gap-y-8 sm:gap-x-16">
        {items.map((item, i) => (
          <li key={item.label}>
            <Reveal delayMs={i * 90} className="text-center">
              <p className="text-5xl font-extrabold tabular-nums tracking-tight text-white sm:text-6xl">
                {item.value.toLocaleString(c.locale === "tr" ? "tr-TR" : "en-US")}
              </p>
              <p className="mt-2 text-sm font-medium text-amber-200">{item.label}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function StepsSection({ c }: { c: SiteContent }) {
  return (
    <Section id="nasil-baslarsiniz" className="bg-slate-50">
      <SectionHeading eyebrow={c.start.eyebrow} title={c.start.title} />
      <ol className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
        {c.startSteps.map((s, i) => (
          <li key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-800">
              {i + 1}
            </p>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function FeaturesSection({ c }: { c: SiteContent }) {
  return (
    <Section id="ozellikler" className="bg-white">
      <SectionHeading title={c.features.title} description={c.features.description} />
      <Reveal delayMs={80} className="mt-10">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.groups.map((g, i) => (
            <li key={i} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{g.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{g.description}</p>
              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {g.points.map((p, j) => (
                  <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                    <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 8.5 3.5 3.5L13 4.5" />
                    </svg>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}

export function PlatformSection({ c }: { c: SiteContent }) {
  const cards = (
    <ul className="grid gap-4 lg:grid-cols-3">
      {c.surfaces.map((s, i) => {
        const Icon = PORTAL_ICONS[i % PORTAL_ICONS.length]!;
        return (
          <li key={i} className="flex flex-col rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50 to-white p-6 shadow-sm">
            <p className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-100">
              <Icon className="h-5 w-5" aria-hidden />
            </p>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
            <PlatformPoints points={s.points} />
          </li>
        );
      })}
    </ul>
  );
  return (
    <Section id="platform" className="bg-slate-50">
      <SectionHeading title={c.platform.title} description={c.platform.description} />
      {/* Dar ekran / desteklemeyen tarayıcı / hareketi azalt: kartlar. */}
      <Reveal delayMs={80} className="nh-story-fallback mt-10">
        {cards}
      </Reveal>
      {/*
        Geniş ekran + scroll-driven animation desteği: kaydırdıkça soldaki
        anlatım akar, sağdaki ekran sabit kalıp portal ekranına geçer.
        Yalnız CSS (globals.css nh-story-*); JS/istek yok.
      */}
      <div className="nh-story mt-12 hidden grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-14">
        <ol className="space-y-0">
          {c.surfaces.map((s, i) => {
            const Icon = PORTAL_ICONS[i % PORTAL_ICONS.length]!;
            return (
              <li key={i} className="nh-story-step flex min-h-[70vh] flex-col justify-center">
                <p className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
                  <Icon className="h-5 w-5" aria-hidden />
                </p>
                <h3 className="mt-5 text-2xl font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-slate-600">{s.description}</p>
                <PlatformPoints points={s.points} />
              </li>
            );
          })}
        </ol>
        <div className="relative">
          <div className="sticky top-[calc(50vh-11rem)]">
            <div aria-hidden className="relative h-[22rem] rounded-[1.25rem] bg-[#4a3208] p-4 shadow-2xl shadow-amber-900/25">
              {STORY_SCENES.slice(0, Math.max(1, c.surfaces.length)).map((scene) => (
                <div key={scene.title} className="nh-story-layer absolute inset-4 rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/15">
                  <SceneBody scene={scene} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function PlatformPoints({ points }: { points: string[] }) {
  return (
    <ul className="mt-4 space-y-2 border-t border-amber-100 pt-4">
      {points.map((p, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
          <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 8.5 3.5 3.5L13 4.5" />
          </svg>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReferencesSection({ c }: { c: SiteContent }) {
  return (
    <Section id="referanslar" className="bg-white">
      <SectionHeading title={c.references.title} />
      {c.referenceItems.length === 0 ? (
        // Uydurma kurum/logo/müşteri sözü GÖSTERİLMEZ; altyapı hazır, veri eklenince kartlar otomatik çıkar.
        <p className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {c.references.empty}
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.referenceItems.map((r, i) => (
            <li key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {r.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logoUrl} alt={r.logoAlt ?? r.name} className="mb-4 h-10 w-auto max-w-[160px] object-contain" />
              ) : null}
              <h3 className="text-base font-semibold text-slate-900">{r.name}</h3>
              {r.sector ? <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{r.sector}</p> : null}
              {r.quote ? <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.quote}</p> : null}
              {r.storyHref ? (
                <Link href={r.storyHref} className={`mt-4 inline-block text-sm font-medium text-amber-700 ${FOCUS_RING}`}>
                  {c.references.story}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export async function PricingSection({ c }: { c: SiteContent }) {
  const { getPublishedCatalog } = await import("@/lib/platform/commercial-catalog");
  const { getPricedPlan } = await import("@/lib/saas-billing/catalog");
  const { PricingPlans } = await import("./pricing-plans");
  const { catalog } = await getPublishedCatalog();
  const labelOf = new Map(catalog.modules.map((m) => [m.key, m.label]));
  const views: PricingPlanView[] = [];
  let anyDemo = false;
  for (const p of catalog.plans) {
    if (p.status !== "active" || p.legacy) continue;
    const monthly = await getPricedPlan(p.key, "monthly");
    const yearly = await getPricedPlan(p.key, "yearly");
    if (!monthly || !yearly) continue;
    const customQuote = monthly.customQuote;
    let savingsPercent: number | null = null;
    if (
      !customQuote &&
      monthly.approved &&
      yearly.approved &&
      monthly.amountMinor > 0 &&
      yearly.amountMinor > 0 &&
      yearly.amountMinor < 12 * monthly.amountMinor
    ) {
      savingsPercent = Math.round((1 - yearly.amountMinor / (12 * monthly.amountMinor)) * 100);
    }
    if (monthly.sandbox && monthly.amountMinor > 0) anyDemo = true;
    views.push({
      key: p.key,
      label: p.label,
      description: p.description || null,
      limits: { students: p.limits.students, users: p.limits.users, branches: p.limits.branches },
      moduleLabels: p.includedModules.map((k) => labelOf.get(k) ?? k),
      customQuote,
      savingsPercent,
      monthly: {
        amountMinor: monthly.amountMinor,
        displayTotal: monthly.displayTotal,
        approved: monthly.approved,
        sandbox: monthly.sandbox,
        taxNote: monthly.taxNote,
      },
      yearly: {
        amountMinor: yearly.amountMinor,
        displayTotal: yearly.displayTotal,
        displayMonthlyEquivalent: yearly.displayMonthlyEquivalent,
        approved: yearly.approved,
        sandbox: yearly.sandbox,
        taxNote: yearly.taxNote,
      },
    });
  }
  return (
    <Section id="fiyatlandirma" className="bg-slate-50">
      <SectionHeading title={c.pricing.title} description={c.pricing.description} />
      {views.length === 0 ? (
        // Gerçek paket verisi yokken UYDURMA fiyat yazılmaz — "bize ulaşın" güvenli yer tutucusu.
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <h3 className="text-lg font-semibold text-slate-900">{c.pricingPlaceholder.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{c.pricingPlaceholder.description}</p>
          {c.links.pricingPlaceholder ? (
            <a
              href={c.links.pricingPlaceholder}
              className={`mt-6 inline-block rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 ${FOCUS_RING}`}
            >
              {c.pricingPlaceholder.cta}
            </a>
          ) : null}
        </div>
      ) : (
        <Reveal delayMs={80} className="mt-10">
          <PricingPlans plans={views} demo={anyDemo} chrome={c.pricingChrome} />
        </Reveal>
      )}
    </Section>
  );
}

export function PurchaseSection({ c }: { c: SiteContent }) {
  return (
    <Section id="satin-alma" className="bg-white">
      <SectionHeading title={c.purchase.title} description={c.purchase.description} />
      <Reveal delayMs={80} className="mx-auto mt-10 max-w-5xl">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
          {c.steps.map((s, i) => (
            <li key={i} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
            </li>
          ))}
        </ol>
      </Reveal>
      {c.links.purchaseCta ? (
        <p className="mt-8 text-center text-sm">
          <a href={c.links.purchaseCta} className={`font-medium text-amber-700 hover:text-amber-800 ${FOCUS_RING}`}>
            {c.purchase.cta}
          </a>
        </p>
      ) : null}
    </Section>
  );
}

export function MediaSection({ c }: { c: SiteContent }) {
  // Görsel/video varlığı YOKKEN bölüm HİÇ render edilmez — kırık görsel/oynatıcı çıkmaz.
  if (c.mediaItems.length === 0) return null;
  return (
    <Section id="medya" className="bg-white">
      <SectionHeading title={c.media.title} description={c.media.description} />
      <ul className="mt-10 grid gap-6 sm:grid-cols-2">
        {c.mediaItems.map((m, i) => (
          <li key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Reveal delayMs={i * 80}>
              {m.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.imageUrl}
                  alt={m.imageAlt ?? m.title}
                  loading="lazy"
                  width={1200}
                  height={750}
                  className="aspect-[8/5] w-full object-cover object-top"
                />
              ) : null}
              {m.videoUrl ? (
                <video src={m.videoUrl} controls preload="none" className="w-full" aria-label={m.title} />
              ) : null}
              <div className="p-5">
                <h3 className="text-base font-semibold text-slate-900">{m.title}</h3>
                {m.caption ? <p className="mt-1 text-sm text-slate-600">{m.caption}</p> : null}
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function FaqSection({ c }: { c: SiteContent }) {
  return (
    <Section id="sss" className="bg-slate-50">
      <SectionHeading title={c.faq.title} description={c.faq.description} />
      <Reveal delayMs={80} className="mx-auto mt-10 max-w-3xl">
        <div className="space-y-3">
          {c.faqItems.map((item, i) => (
            <details key={i} className="group rounded-2xl border border-slate-200 bg-white p-5">
              <summary
                className={`cursor-pointer list-none text-base font-semibold text-slate-900 ${FOCUS_RING} rounded-lg`}
              >
                {item.question}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

/** Etiket → ağ anahtarı; kayıtlı URL varsa link, yoksa "yakında" rozeti. */
async function socialWithHrefs(): Promise<{ label: string; href?: string }[]> {
  const stored = await getSiteSocial().catch(() => null);
  const keyOf = new Map<string, SiteSocialNetwork>(
    Object.entries(SITE_SOCIAL_LABELS).map(([k, v]) => [v, k as SiteSocialNetwork])
  );
  return SITE_CONTACT.social.map((s) => {
    const key = keyOf.get(s.label);
    const href = (key && stored?.[key]) || s.href || undefined;
    return href ? { label: s.label, href } : { label: s.label };
  });
}

export async function ContactSection({ c }: { c: SiteContent }) {
  const social = (await socialWithHrefs()).filter((s) => s.href);
  const info = c.contactInfo;
  const details = [
    info.email ? { icon: Mail, label: c.contact.email, value: info.email, href: `mailto:${info.email}` } : null,
    info.phone ? { icon: Phone, label: c.contact.phone, value: info.phone, href: `tel:${info.phone}` } : null,
    info.address ? { icon: MapPin, label: c.contact.address, value: info.address, href: null } : null,
  ].filter((d): d is NonNullable<typeof d> => d !== null);
  return (
    // Başlık rengi globals.css'te `--text-primary`tan gelir; satır içi verilince temaya ve CSS derlemesine bağlı kalmaz.
    <Section id="iletisim" className="relative overflow-hidden bg-slate-950" style={{ "--text-primary": "#ffffff" } as CSSProperties}>
      <div
        aria-hidden
        className="nh-drift pointer-events-none absolute -left-1/4 top-0 h-[120%] w-[70%] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #d97706, transparent)" }}
      />
      <Reveal className="relative grid gap-10 rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <Eyebrow tone="dark">{c.contact.title}</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{c.contact.demoTitle}</h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">{c.contact.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {info.email ? (
              <a
                href={`mailto:${info.email}?subject=${encodeURIComponent(`NeviiHub ${c.contact.demoTitle}`)}`}
                className={`inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 ${FOCUS_RING_DARK}`}
              >
                <Mail className="h-4 w-4" aria-hidden />
                {c.contact.demoCta}
              </a>
            ) : null}
            <a
              href={c.links.contactTrial ?? "/deneme"}
              className={`inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10 ${FOCUS_RING_DARK}`}
            >
              {c.hero.trial}
            </a>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-6">
          {details.length > 0 ? (
            <ul className="space-y-3">
              {details.map((d) => (
                <li key={d.label}>
                  {d.href ? (
                    <a
                      href={d.href}
                      className={`nh-lift flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 hover:bg-white/[0.1] ${FOCUS_RING_DARK}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                        <d.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-400">{d.label}</span>
                        <span className="block truncate text-sm font-medium text-white">{d.value}</span>
                      </span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                        <d.icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-400">{d.label}</span>
                        <span className="block text-sm font-medium text-white">{d.value}</span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            // Uydurma telefon/e-posta/adres YAZILMAZ; kurum bilgisi girilene kadar dürüst yer tutucu.
            <p className="text-sm leading-relaxed text-slate-300">{c.contact.pending}</p>
          )}
          {social.length > 0 ? (
            <div>
              <p className="text-sm text-slate-400">{c.contact.follow}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {social.map((s) => (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      aria-label={s.label}
                      className={`nh-lift flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-slate-200 ring-1 ring-white/10 hover:bg-amber-500 hover:text-slate-950 ${FOCUS_RING_DARK}`}
                    >
                      <SocialIcon network={socialKey(s.label)} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Reveal>
      {info.mapEmbedUrl ? (
        <iframe
          src={info.mapEmbedUrl}
          title={c.contact.mapTitle}
          loading="lazy"
          className="relative mt-8 h-64 w-full rounded-2xl border border-white/10"
        />
      ) : null}
    </Section>
  );
}

export async function MobileAppSection({ c }: { c: SiteContent }) {
  const { getSiteMobileApps, resolveMobileAppLinks } = await import("@/lib/platform/site-mobile-apps");
  const [site, resolved] = await Promise.all([getSiteMobileApps(), resolveMobileAppLinks()]);
  const appUrl = site.appStoreVisible ? resolved.appStoreUrl : undefined;
  const playUrl = site.playVisible ? resolved.playStoreUrl : undefined;
  const btn = `inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 ${FOCUS_RING}`;
  return (
    <Section id="mobil-uygulama" className="bg-white">
      <SectionHeading title={c.mobileApp.title} description={c.mobileApp.description} />
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {appUrl ? (
          <a href={appUrl} className={btn}>
            <StoreIcon store="apple" />
            {c.mobileApp.appStore}
          </a>
        ) : null}
        {playUrl ? (
          <a href={playUrl} className={btn}>
            <StoreIcon store="play" />
            {c.mobileApp.play}
          </a>
        ) : null}
        {!appUrl && !playUrl ? (
          <p className="rounded-xl bg-slate-50 px-5 py-3 text-sm text-slate-600 ring-1 ring-slate-200">{c.mobileApp.soon}</p>
        ) : null}
      </div>
    </Section>
  );
}

export async function SiteFooter({ c }: { c: SiteContent }) {
  const social = await socialWithHrefs();
  const { getSiteMobileApps, resolveMobileAppLinks } = await import("@/lib/platform/site-mobile-apps");
  const [site, resolved] = await Promise.all([getSiteMobileApps(), resolveMobileAppLinks()]);
  const appUrl = site.appStoreVisible ? resolved.appStoreUrl : undefined;
  const playUrl = site.playVisible ? resolved.playStoreUrl : undefined;
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2.5">
          <SiteLogo size={28} />
          <span className="text-sm font-semibold text-slate-900">{BRAND.name}</span>
        </div>
        <nav aria-label="Alt menü" className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {c.nav.map((item, i) => (
            <a key={i} href={item.href} className={`text-sm text-slate-600 hover:text-slate-900 ${FOCUS_RING}`}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-2 sm:items-end">
          {c.contactInfo.email ? (
            <a href={`mailto:${c.contactInfo.email}`} className={`text-sm font-medium text-amber-700 ${FOCUS_RING}`}>
              {c.contactInfo.email}
            </a>
          ) : null}
          {social.length > 0 ? (
            <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {social.map((s) => (
                <li key={s.label}>
                  {s.href ? (
                    <a href={s.href} className={`inline-flex items-center gap-1 hover:text-slate-900 ${FOCUS_RING}`}>
                      <SocialIcon network={socialKey(s.label)} className="h-3.5 w-3.5" />
                      {s.label}
                    </a>
                  ) : (
                    <span aria-label={`${s.label} (${c.contact.soon})`} className="inline-flex items-center gap-1">
                      <SocialIcon network={socialKey(s.label)} className="h-3.5 w-3.5" />
                      {s.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {appUrl || playUrl ? (
            <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {appUrl ? (
                <a href={appUrl} className={`hover:text-slate-900 ${FOCUS_RING}`}>
                  {c.mobileApp.appStore}
                </a>
              ) : null}
              {playUrl ? (
                <a href={playUrl} className={`hover:text-slate-900 ${FOCUS_RING}`}>
                  {c.mobileApp.play}
                </a>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} {BRAND.name}
            {c.footer.rights ? ` · ${c.footer.rights}` : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
