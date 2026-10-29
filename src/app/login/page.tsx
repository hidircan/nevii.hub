import Image from "next/image";
import Link from "@/components/link";
import { redirect } from "next/navigation";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";
import { PORTAL_RECORD_MISSING_PARAM } from "@/lib/auth/portal-record-missing";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, authCopy, readLocaleCookie } from "@/lib/i18n/copy";
import { resolveSafeLoginNext } from "@/lib/auth/role-routes";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <div className="w-full max-w-md">
        {/*
          P0 revizyonu — login ekranından ana sayfaya görünür dönüş.
          Yalnız bu sayfaya özeldir (ortak auth layout yok — şifre sıfırlama/
          aktivasyon ekranlarına yayılmaz). Formun DIŞINDA bir Link olduğu
          için submit davranışıyla karışmaz; metin + ikon birlikte görünür
          (yalnız ikon değil), ghost/ikincil görünümdedir.
        */}
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <span aria-hidden>←</span> {copy.backHome}
        </Link>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 text-center">
          {BRAND.logoPath ? (
            <Image
              src={BRAND.logoPath}
              alt=""
              width={48}
              height={48}
              className="mx-auto mb-3 rounded-xl"
            />
          ) : null}
          {/* P1 revizyonu — marka "NeviiHub" aynen görünür (uppercase "NEVİİHUB" üretirdi). */}
          <p className="text-2xl font-extrabold tracking-wide text-[var(--color-primary)]">
            {BRAND.shortName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{copy.signIn}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {copy.signInHelp}
          </p>
        </div>
        {portalRecordMissing ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
            <p className="text-sm font-semibold text-amber-900">Hesabınıza bağlı kurum kaydı bulunamadı.</p>
            <p className="mt-1 text-xs text-amber-900/80">
              Girişiniz geçerli ancak bu hesaba bağlı öğrenci/öğretmen kaydı kaldırılmış görünüyor. Lütfen
              kurumunuzla iletişime geçin ya da farklı bir hesapla giriş yapın.
            </p>
          </div>
        ) : null}
        {params.oturum === "devralindi" ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" role="status">
            <p className="text-sm font-semibold text-amber-900">Oturumunuz başka bir cihazda açıldığı için kapatıldı.</p>
            <p className="mt-1 text-xs text-amber-900/80">
              Bu hesap aynı anda tek cihazda kullanılabilir. Devam etmek için yeniden giriş yapın; diğer cihazdaki oturum
              kapatılacaktır.
            </p>
          </div>
        ) : null}
        {params.oturum === "zaman-asimi" ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3" role="status">
            <p className="text-sm font-semibold text-amber-900">Uzun süre işlem yapılmadığı için oturumunuz kapatıldı.</p>
            <p className="mt-1 text-xs text-amber-900/80">
              Güvenlik için hareketsiz oturumlar otomatik kapanır. Yeniden giriş yaptıktan sonra kaydedilmemiş bir değişikliğiniz
              olduysa ilgili ekranda kontrol edin.
            </p>
          </div>
        ) : null}
        <LoginForm nextPath={safeNext || undefined} lang={lang} />
        </div>
      </div>
    </div>
  );
}
