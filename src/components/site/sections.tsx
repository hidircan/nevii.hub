/**
 * GİRİŞ ÖNCESİ KURUMSAL SİTE BÖLÜMLERİ (10. tur iş #3 redesign; temel 2026-09-05).
 *
 * Her bölüm bağımsız, yeniden kullanılabilir ve responsive bir bileşendir;
 * sayfa (`src/app/page.tsx`) yalnızca bunları SIRALAR. Yeni bir bölüm
 * eklemek ya da sırasını değiştirmek sayfa yapısını yeniden yazmayı
 * GEREKTİRMEZ.
 *
 * TEMA: bu ekran BİLİNÇLİ olarak her zaman AÇIK temadır — cihaz koyu temada
 * olsa bile renkler sabittir (`var(--color-*)` KULLANILMAZ), böylece logo ve
 * metin kontrastı öngörülebilir kalır. Logo ayrıca beyaz bir "güvenli alan"
 * kartında durur.
 *
 * İÇERİK: tamamı `src/lib/site-content.ts`ten gelir. Gerçek verisi olmayan
 * bölümler (referans, fiyat, medya) UYDURMA veri göstermek yerine dürüst bir
 * "hazırlanıyor / bize ulaşın" durumuna düşer. Ekran görüntüleri yalnız
 * GERÇEK ürün + sentetik/demo veri ile eklenir — doğrulanmamış görsel
 * kullanılmaz.
 */
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  ClipboardCheck,
  FileText,
  GraduationCap,
  HandCoins,
  LayoutDashboard,
  Mail,
  Users,
  Wallet,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  SITE_CONTACT,
  SITE_FAQ,
  SITE_FEATURES,
  SITE_HERO,
  SITE_HIGHLIGHTS,
  SITE_MEDIA,
  SITE_NAV,
  SITE_PLATFORM_SURFACES,
  SITE_PRICING_PLACEHOLDER,
  SITE_PRICING_PLANS,
  SITE_REFERENCES,
  SITE_STEPS,
} from "@/lib/site-content";

/** Odak halkası her etkileşimli öğede AYNI — klavye kullanıcısı nerede olduğunu her zaman görür. */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** Koyu zeminli İletişim bölümü için: halka açık amber, ofset koyu zemine uyar. */
const FOCUS_RING_DARK =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800";

const FEATURE_ICONS = [Calendar, ClipboardCheck, FileText, Wallet, Bot, HandCoins] as const;
const PORTAL_ICONS = [LayoutDashboard, GraduationCap, Users] as const;

function Section({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 px-6 py-16 sm:py-20 ${className}`}>
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
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 text-base leading-relaxed text-slate-600">{description}</p> : null}
    </div>
  );
}

/** Beyaz güvenli alan — cihaz/tema koyu olsa da marka logosu her zaman okunur. */
export function SiteLogo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
      <Image src={BRAND.logoPath ?? "/icon.png"} alt={BRAND.name} width={size} height={size} className="rounded-lg" />
    </span>
  );
}

export function SiteHeader() {
  return (
    <header id="ust" className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className={`flex items-center gap-2.5 rounded-lg ${FOCUS_RING}`}>
          <SiteLogo size={32} />
          <span className="text-lg font-extrabold tracking-wide text-slate-900">{BRAND.shortName}</span>
        </Link>
        <nav aria-label="Ana menü" className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="#iletisim"
            className={`hidden rounded-lg border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 sm:inline-block ${FOCUS_RING}`}
          >
            Demo İste
          </a>
          <Link
            href="/login"
            className={`rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 ${FOCUS_RING}`}
          >
            Giriş Yap
          </Link>
        </div>
      </div>
      {/* Mobilde menü ayrı bir satırda, yatay kaydırılabilir — JS'siz, erişilebilir. */}
      <nav aria-label="Ana menü (mobil)" className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        {SITE_NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 ${FOCUS_RING}`}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-14 pt-14 sm:pb-20 sm:pt-20">
      {/* Yumuşak, hareketsiz gradyan — otomatik oynayan medya/ağır animasyon YOK. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_0%,#fef3c7_0%,#ffffff_60%)]"
      />
      <div className="mx-auto max-w-3xl text-center">
        <p className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {BRAND.logoPath ? (
            <Image
              src={BRAND.logoPath}
              alt=""
              aria-hidden
              width={40}
              height={40}
              priority
              className="h-8 w-8 object-contain sm:h-10 sm:w-10"
            />
          ) : null}
          <span className="text-xl font-extrabold normal-case tracking-tight text-slate-900 sm:text-2xl">
            {BRAND.shortName}
          </span>
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">{SITE_HERO.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {SITE_HERO.subline}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={SITE_HERO.primaryCta.href}
            className={`inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 ${FOCUS_RING}`}
          >
            {SITE_HERO.primaryCta.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <Link
            href={SITE_HERO.secondaryCta.href}
            className={`rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS_RING}`}
          >
            {SITE_HERO.secondaryCta.label}
          </Link>
        </div>
        <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-700">
          {SITE_HIGHLIGHTS.map((h) => (
            <li key={h} className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-amber-600" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <Section id="hakkimizda" className="bg-white">
      <SectionHeading
        eyebrow="NeviiHub nedir?"
        title="Kurumunuzun günlük işleyişi için tasarlandı"
        description="Ders planlamasından yoklamaya, sözleşmeden tahsilata kadar kurumun tüm operasyonu tek bir yerdedir. Her kurum yalnızca kendi verisini görür, her rol yalnızca yetkili olduğu kadarını."
      />
    </Section>
  );
}

export function StepsSection() {
  return (
    <Section id="nasil-baslarsiniz" className="bg-slate-50">
      <SectionHeading eyebrow="Başlangıç" title="Üç adımda yayında" />
      <ol className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
        {SITE_STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

export function FeaturesSection() {
  return (
    <Section id="ozellikler" className="bg-white">
      <SectionHeading eyebrow="Modüller" title="Arka ofisin tamamı tek panelde" />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SITE_FEATURES.map((f, i) => {
          const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]!;
          return (
            <li key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Icon className="h-5 w-5" aria-hidden />
              </p>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function PlatformSection() {
  return (
    <Section id="platform" className="bg-slate-50">
      <SectionHeading eyebrow="Portallar" title="Üç portal, tek platform" description="Herkes kendi işine odaklanır; veri tek yerde kalır." />
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {SITE_PLATFORM_SURFACES.map((s, i) => {
          const Icon = PORTAL_ICONS[i % PORTAL_ICONS.length]!;
          return (
            <li key={s.title} className="rounded-2xl bg-gradient-to-b from-amber-50 to-white p-6 ring-1 ring-amber-100">
              <p className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-100">
                <Icon className="h-5 w-5" aria-hidden />
              </p>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function ReferencesSection() {
  return (
    <Section id="referanslar" className="bg-white">
      <SectionHeading eyebrow="Referanslar" title="Bizi kullanan kurumlar" />
      {SITE_REFERENCES.length === 0 ? (
        // Uydurma kurum/logo/müşteri sözü GÖSTERİLMEZ; altyapı hazır, veri eklenince kartlar otomatik çıkar.
        <p className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
          Referans kurumlarımız ve başarı hikâyeleri yakında bu bölümde yayımlanacak.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_REFERENCES.map((r) => (
            <li key={r.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {r.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logoUrl} alt={r.logoAlt ?? r.name} className="mb-4 h-10 w-auto max-w-[160px] object-contain" />
              ) : null}
              <h3 className="text-base font-semibold text-slate-900">{r.name}</h3>
              {r.sector ? <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{r.sector}</p> : null}
              {r.quote ? <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.quote}</p> : null}
              {r.storyHref ? (
                <Link href={r.storyHref} className={`mt-4 inline-block text-sm font-medium text-amber-700 ${FOCUS_RING}`}>
                  Hikâyeyi okuyun →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function PricingSection() {
  return (
    <Section id="fiyatlandirma" className="bg-slate-50">
      <SectionHeading eyebrow="Fiyatlandırma" title="Kurumunuza uygun plan" />
      {SITE_PRICING_PLANS.length === 0 ? (
        // Gerçek paket verisi yokken UYDURMA fiyat yazılmaz — "bize ulaşın" güvenli yer tutucusu.
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{SITE_PRICING_PLACEHOLDER.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{SITE_PRICING_PLACEHOLDER.description}</p>
          <a
            href={SITE_PRICING_PLACEHOLDER.ctaHref}
            className={`mt-6 inline-block rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 ${FOCUS_RING}`}
          >
            {SITE_PRICING_PLACEHOLDER.ctaLabel}
          </a>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_PRICING_PLANS.map((p) => (
            <li key={p.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{p.summary}</p>
              {p.priceLabel ? <p className="mt-4 text-2xl font-semibold text-slate-900">{p.priceLabel}</p> : null}
              <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {p.ctaHref && p.ctaLabel ? (
                <a href={p.ctaHref} className={`mt-5 inline-block text-sm font-semibold text-amber-700 ${FOCUS_RING}`}>
                  {p.ctaLabel} →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function MediaSection() {
  // Görsel/video varlığı YOKKEN bölüm HİÇ render edilmez — kırık görsel/oynatıcı çıkmaz.
  if (SITE_MEDIA.length === 0) return null;
  return (
    <Section id="medya" className="bg-white">
      <SectionHeading eyebrow="Tanıtım" title="Ekran görüntüleri ve tanıtım" />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {SITE_MEDIA.map((m) => (
          <li key={m.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {m.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.imageUrl} alt={m.imageAlt ?? m.title} className="w-full object-cover" loading="lazy" />
            ) : null}
            {m.videoUrl ? (
              <video src={m.videoUrl} controls preload="none" className="w-full" aria-label={m.title} />
            ) : null}
            <div className="p-5">
              <h3 className="text-base font-semibold text-slate-900">{m.title}</h3>
              {m.caption ? <p className="mt-1 text-sm text-slate-600">{m.caption}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function FaqSection() {
  return (
    <Section id="sss" className="bg-white">
      <SectionHeading eyebrow="SSS" title="Sıkça sorulan sorular" />
      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {SITE_FAQ.map((item) => (
          <details key={item.question} className="group rounded-2xl border border-slate-200 bg-white p-5">
            <summary
              className={`cursor-pointer list-none text-base font-semibold text-slate-900 ${FOCUS_RING} rounded-lg`}
            >
              {item.question}
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function ContactSection() {
  const hasDetails = !!(SITE_CONTACT.phone || SITE_CONTACT.email || SITE_CONTACT.address);
  return (
    <Section id="iletisim" className="bg-slate-900">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow tone="dark">İletişim</Eyebrow>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Ücretsiz demo isteyin
        </h2>
        <p className="mt-3 text-base leading-relaxed text-slate-300">
          Kurumunuz için uygun kurulum ve planı birlikte belirleyelim.
        </p>
      </div>
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center">
        {hasDetails ? (
          <dl className="space-y-2 text-sm text-slate-200">
            {SITE_CONTACT.phone ? (
              <div>
                <dt className="inline font-semibold">Telefon: </dt>
                <dd className="inline">
                  <a href={`tel:${SITE_CONTACT.phone}`} className={FOCUS_RING_DARK}>
                    {SITE_CONTACT.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {SITE_CONTACT.email ? (
              <div>
                <dt className="inline font-semibold">E-posta: </dt>
                <dd className="inline">
                  <a href={`mailto:${SITE_CONTACT.email}`} className={`underline ${FOCUS_RING_DARK}`}>
                    {SITE_CONTACT.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {SITE_CONTACT.address ? (
              <div>
                <dt className="inline font-semibold">Adres: </dt>
                <dd className="inline">{SITE_CONTACT.address}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          // Uydurma telefon/e-posta/adres YAZILMAZ; kurum bilgisi girilene kadar dürüst yer tutucu.
          <p className="text-sm leading-relaxed text-slate-300">
            İletişim bilgilerimiz yakında burada yayımlanacak. Kurum hesabınız varsa panelden bize ulaşabilirsiniz.
          </p>
        )}
        {SITE_CONTACT.email ? (
          <a
            href={`mailto:${SITE_CONTACT.email}?subject=${encodeURIComponent("NeviiHub demo talebi")}`}
            className={`mt-6 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 ${FOCUS_RING_DARK}`}
          >
            <Mail className="h-4 w-4" aria-hidden />
            Demo e-postası gönderin
          </a>
        ) : null}
        {SITE_CONTACT.social.length > 0 ? (
          <ul className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
            {SITE_CONTACT.social.map((s) => (
              <li key={s.href}>
                <a href={s.href} className={`font-medium text-amber-400 ${FOCUS_RING_DARK}`}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {SITE_CONTACT.mapEmbedUrl ? (
          <iframe
            src={SITE_CONTACT.mapEmbedUrl}
            title="Konum haritası"
            loading="lazy"
            className="mt-6 h-64 w-full rounded-xl border border-slate-700"
          />
        ) : null}
      </div>
    </Section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2.5">
          <SiteLogo size={28} />
          <span className="text-sm font-semibold text-slate-900">{BRAND.name}</span>
        </div>
        <nav aria-label="Alt menü" className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {SITE_NAV.map((item) => (
            <a key={item.href} href={item.href} className={`text-sm text-slate-600 hover:text-slate-900 ${FOCUS_RING}`}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="text-xs text-slate-500">
          {SITE_CONTACT.email ? (
            <a href={`mailto:${SITE_CONTACT.email}`} className={`mr-3 underline ${FOCUS_RING}`}>
              {SITE_CONTACT.email}
            </a>
          ) : null}
          © {new Date().getFullYear()} {BRAND.name}
        </div>
      </div>
    </footer>
  );
}
