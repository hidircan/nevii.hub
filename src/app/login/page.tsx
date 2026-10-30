import Link from "@/components/link";
import { redirect } from "next/navigation";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { PlatformLogo } from "@/components/platform-logo";
import { BRAND } from "@/lib/brand";
import { PORTAL_RECORD_MISSING_PARAM } from "@/lib/auth/portal-record-missing";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, authCopy, readLocaleCookie } from "@/lib/i18n/copy";
import { resolveSafeLoginNext } from "@/lib/auth/role-routes";
import { SiteAppBanner } from "@/components/site/app-banner";
import { ShowcaseCycle } from "@/components/site/showcase-panel";
import { appStoreIdFromUrl, getAppBannerConfig, resolveMobileAppLinks } from "@/lib/platform/site-mobile-apps";
import { getPlatformBrand } from "@/lib/platform/branding";
import { turnstileSiteKeyForWidget, turnstileStatus } from "@/lib/auth/turnstile";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  // iOS Safari'nin yerel "Uygulamada aç" bandı (App Store kimliği varsa).
  const links = await resolveMobileAppLinks().catch(() => null);
  const appId = links?.appStoreUrl ? appStoreIdFromUrl(links.appStoreUrl) : null;
  return appId ? { other: { "apple-itunes-app": `app-id=${appId}` } } : {};
}

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; oturum?: string; [PORTAL_RECORD_MISSING_PARAM]?: string }>;
}) {
  const session = await getSessionContext();
  const params = await searchParams;
  const lang = readLocaleCookie((await cookies()).get(LOCALE_COOKIE)?.value);
  const copy = authCopy(lang);
  // P0 (2026-09-05) — YÖNLENDİRME DÖNGÜSÜ KIRICI: bir portal sayfası
  // "oturum geçerli ama kuruma ait kaydı yok" diyerek buraya gönderdiyse,
  // kullanıcıyı AYNI portala geri YOLLAMAYIZ (bkz. portal-record-missing.ts).
  const portalRecordMissing = params[PORTAL_RECORD_MISSING_PARAM] === "1";
  // Control Center (2026-09-28) — `next` sunucuda da doğrulanır (open redirect kapalı).
  const safeNext = resolveSafeLoginNext(params.next, "");
  if (session && !portalRecordMissing) {
    redirect(safeNext || homePathForRole(session.role));
  }

  const [appBanner, brand] = await Promise.all([getAppBannerConfig().catch(() => null), getPlatformBrand()]);
  const banners = (
    <>
      {portalRecordMissing ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] p-3" role="alert">
          <p className="text-sm font-semibold text-[var(--color-warning)]">Hesabınıza bağlı kurum kaydı bulunamadı.</p>
          <p className="mt-1 text-xs text-[var(--color-text)]">
            Girişiniz geçerli ancak bu hesaba bağlı öğrenci/öğretmen kaydı kaldırılmış görünüyor. Lütfen
            kurumunuzla iletişime geçin ya da farklı bir hesapla giriş yapın.
          </p>
        </div>
      ) : null}
      {params.oturum === "devralindi" ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] p-3" role="status">
          <p className="text-sm font-semibold text-[var(--color-warning)]">Oturumunuz başka bir cihazda açıldığı için kapatıldı.</p>
          <p className="mt-1 text-xs text-[var(--color-text)]">
            Bu hesap aynı anda tek cihazda kullanılabilir. Devam etmek için yeniden giriş yapın; diğer cihazdaki oturum
            kapatılacaktır.
          </p>
        </div>
      ) : null}
      {params.oturum === "zaman-asimi" ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)] p-3" role="status">
          <p className="text-sm font-semibold text-[var(--color-warning)]">Uzun süre işlem yapılmadığı için oturumunuz kapatıldı.</p>
          <p className="mt-1 text-xs text-[var(--color-text)]">
            Güvenlik için hareketsiz oturumlar otomatik kapanır. Yeniden giriş yaptıktan sonra kaydedilmemiş bir değişikliğiniz
            olduysa ilgili ekranda kontrol edin.
          </p>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="grid min-h-screen bg-[var(--color-bg)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/*
        Marka paneli (yalnız geniş ekran). Tek vurgu: ürünün kendi dünyasından
        bir "bugün" çizelgesi — ders, saat, yoklama durumu. Dekoratiftir
        (aria-hidden); renkler tema tokenlarından gelir, kurum teması değişince uyar.
      */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-primary-soft-text)] p-12 text-[var(--color-text-inverted)] lg:flex xl:p-16">
        <div
          aria-hidden
          className="nh-drift pointer-events-none absolute -right-1/4 -top-1/4 h-[70%] w-[90%] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--color-primary), transparent)" }}
        />
        <Link
          href="/"
          className="relative inline-flex w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="inline-flex rounded-lg bg-white/95 p-1">
            <PlatformLogo height={28} />
          </span>
          <span className="text-xl font-extrabold tracking-tight">{BRAND.shortName}</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="nh-rise text-4xl leading-[1.12] xl:text-[2.6rem]" style={{ color: "#fff", fontWeight: 400 }}>Kurumunuzun bütün günü tek ekranda.</h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-white/75">
            Ders programı, yoklama, telafi ve tahsilat; müzik okulundan yoga stüdyosuna her eğitim kurumu için.
          </p>

          <ShowcaseCycle className="nh-rise mt-10" style={{ "--nh-delay": "120ms" } as React.CSSProperties} />
        </div>

        <p className="relative max-w-sm text-xs leading-relaxed text-white/60">
          Bağlantınız şifrelidir. Her kurumun verisi diğerlerinden ayrı tutulur ve yalnızca yetki verdiği kişilere açılır.
        </p>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8 lg:px-12">
        {/* P0 revizyonu — login ekranından ana sayfaya görünür dönüş (metin + ok, ikincil görünüm). */}
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <span aria-hidden>←</span> {copy.backHome}
        </Link>

        <div className="nh-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-8 lg:hidden">
            {/* Beyaz güvenli alan: koyu temada da koyu logo okunur. */}
            <span className="mb-3 inline-flex rounded-xl bg-white p-1.5 ring-1 ring-[var(--color-border)]">
              <PlatformLogo height={32} />
            </span>
            {/* P1 revizyonu — marka "NeviiHub" aynen görünür (uppercase üretmez). */}
            <p className="text-lg font-extrabold tracking-tight text-[var(--color-primary)]">{BRAND.shortName}</p>
          </div>
          <h1 className="text-3xl text-[var(--color-text)]">{copy.signIn}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{copy.signInHelp}</p>
          <div className="mt-8">
            {banners}
            <LoginForm nextPath={safeNext || undefined} lang={lang} turnstileSiteKey={turnstileSiteKeyForWidget()} turnstileRequired={turnstileStatus() === "active"} />
          </div>
          <p className="mt-10 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Hesabınız kurumunuz tarafından açılır. Giriş bilgilerinizi bilmiyorsanız kurumunuzun yöneticisine başvurun.
            Kurumunuz için NeviiHub almak istiyorsanız{" "}
            <Link href="/#fiyatlandirma" className="font-medium text-[var(--color-primary)] hover:underline">
              paketleri inceleyin
            </Link>
            .
          </p>
        </div>
      </main>
      {appBanner ? (
        <SiteAppBanner
          {...appBanner}
          iconUrl={brand.appleIconUrl}
          title={lang === "en" ? "NeviiHub app" : "NeviiHub uygulaması"}
          subtitle={lang === "en" ? "Notifications and one-tap actions" : "Bildirimler ve tek dokunuşla işlemler"}
          openLabel={lang === "en" ? "Open" : "Uygulamada aç"}
          dismissLabel={lang === "en" ? "Dismiss" : "Kapat"}
        />
      ) : null}
    </div>
  );
}
