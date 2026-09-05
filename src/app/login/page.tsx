import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";
import { PORTAL_RECORD_MISSING_PARAM } from "@/lib/auth/portal-record-missing";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; [PORTAL_RECORD_MISSING_PARAM]?: string }>;
}) {
  const session = await getSessionContext();
  const params = await searchParams;
  // P0 (2026-09-05) — YÖNLENDİRME DÖNGÜSÜ KIRICI: bir portal sayfası
  // "oturum geçerli ama kuruma ait kaydı yok" diyerek buraya gönderdiyse,
  // kullanıcıyı AYNI portala geri YOLLAMAYIZ (bkz. portal-record-missing.ts).
  const portalRecordMissing = params[PORTAL_RECORD_MISSING_PARAM] === "1";
  if (session && !portalRecordMissing) {
    redirect(params.next || homePathForRole(session.role));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
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
          <p className="text-2xl font-extrabold uppercase tracking-wide text-[var(--color-primary)]">
            {BRAND.shortName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">Giriş yap</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Okul yönetimi, öğretmen ve öğrenci portalları için oturum açın.
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
        <LoginForm nextPath={params.next} />
      </div>
    </div>
  );
}
