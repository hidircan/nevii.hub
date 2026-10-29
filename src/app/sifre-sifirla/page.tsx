import { ResetPasswordForm } from "@/components/reset-password-form";
import { BRAND } from "@/lib/brand";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, authCopy, readLocaleCookie } from "@/lib/i18n/copy";

export const dynamic = "force-dynamic";

/**
 * Portal erişim yönetimi görevi — şifre sıfırlama sayfası (public).
 * `/hesap-aktivasyon` ile AYNI kabuk/stil. Kod e-postadan gelen linkle
 * (`?token=`) otomatik doldurulur AMA kullanıcı isterse elle de girebilir
 * (bkz. `src/lib/auth/password-reset.ts` CODE_ALPHABET tasarım notu — bu
 * kod bir deep-link değil, elle yazılabilir bir koddur). Token doğrulaması
 * sunucuda (`/api/v1/auth/reset-password`) yapılır.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; mode?: string }>;
}) {
  const { token, mode } = await searchParams;
  const lang = readLocaleCookie((await cookies()).get(LOCALE_COOKIE)?.value);
  const copy = authCopy(lang);
  // Satın alma sonrası ilk kurulum (?mode=setup): "şifrenizi unuttunuz" dili YOK.
  const setup = mode === "setup";
  const title = setup ? (lang === "en" ? "Set your password" : "Parolanızı belirleyin") : copy.resetTitle;
  const help = setup
    ? lang === "en"
      ? "Set a password to access your account. The setup link is single-use and valid for 72 hours."
      : "Hesabınıza erişmek için parolanızı belirleyin. Kurulum bağlantısı tek kullanımlıktır ve 72 saat geçerlidir."
    : copy.resetHelp;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 text-center">
          {/* P1 revizyonu — marka "NeviiHub" aynen görünür (uppercase "NEVİİHUB" üretirdi). */}
          <p className="text-2xl font-extrabold tracking-wide text-[var(--color-primary)]">{BRAND.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {help}
          </p>
        </div>
        <ResetPasswordForm initialToken={token ?? ""} setupMode={setup} />
      </div>
    </div>
  );
}
