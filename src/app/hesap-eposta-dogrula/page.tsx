import { ConfirmEmailChangeCard } from "@/components/confirm-email-change-card";

export const dynamic = "force-dynamic";

/**
 * E-posta doğrulama iniş sayfası (public — bağlantıyı farklı cihazda açan
 * kullanıcı session'sız gelebilir; token'ın kendisi yetkilidir).
 * Başarılı onay sonrası kullanıcı YENİ adresiyle giriş yapar.
 */
export default async function HesapEpostaDogrulaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <div className="w-full max-w-md">
        <ConfirmEmailChangeCard token={token} />
      </div>
    </div>
  );
}
