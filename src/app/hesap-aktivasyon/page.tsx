import { AcceptInvitationForm } from "@/components/accept-invitation-form";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * Faz 4 — hesap daveti kabul sayfası (public, "Şifrenizi Oluşturun" linki
 * buraya yönlendirir). `/login` sayfasıyla AYNI kabuk/stil. Token doğrulaması
 * sunucuda (`/api/v1/auth/accept-invitation`) yapılır — bu sayfa token'ı
 * yalnızca query'den alıp forma iletir, kendisi doğrulamaz.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 text-center">
          {/* P1 revizyonu — marka "NeviiHub" aynen görünür (uppercase "NEVİİHUB" üretirdi). */}
          <p className="text-2xl font-extrabold tracking-wide text-[var(--color-primary)]">{BRAND.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">Hesabınızı Aktifleştirin</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Devam etmek için kendi şifrenizi belirleyin.
          </p>
        </div>
        {token ? (
          <AcceptInvitationForm token={token} />
        ) : (
          <p className="text-sm font-medium text-rose-600">Geçersiz davet bağlantısı — token eksik.</p>
        )}
      </div>
    </div>
  );
}
