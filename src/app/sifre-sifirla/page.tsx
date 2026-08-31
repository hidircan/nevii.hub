import { ResetPasswordForm } from "@/components/reset-password-form";
import { BRAND } from "@/lib/brand";

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
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 text-center">
          <p className="text-2xl font-extrabold uppercase tracking-wide text-[var(--color-primary)]">{BRAND.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">Şifrenizi Sıfırlayın</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            E-postanızdaki kodu girin ve yeni şifrenizi belirleyin.
          </p>
        </div>
        <ResetPasswordForm initialToken={token ?? ""} />
      </div>
    </div>
  );
}
