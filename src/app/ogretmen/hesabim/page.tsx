import { redirect } from "next/navigation";
import { requireSessionContext, notificationSettingsPathForRole } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Öğretmen Hesabım. 2026-10-14 (owner kuralı): öğretmen portal giriş e-postasını YALNIZ kurum sahibi değiştirir
 * (Öğretmenler → Bilgiler → Portal Erişimi). Öğretmen self-servis değişikliği sunucuda da kapalıdır
 * (`/api/v1/account/email-change/request`); burada yalnız mevcut giriş adresi ve yol gösterilir.
 */
export default async function OgretmenHesabimPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/hesabim");
  }
  if (session.role !== "TEACHER") {
    redirect(notificationSettingsPathForRole(session.role));
  }

  const user = await getUserById(session.userId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Hesabım" description="Portal giriş bilgileriniz." />
      <Card>
        <h2 className="mb-2 font-semibold text-[var(--color-text)]">Giriş e-postası</h2>
        <p className="text-sm font-medium text-[var(--color-text)]">{user?.email ?? "Bilinmiyor"}</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Portal giriş e-postanızı kurum sahibi değiştirir. Değişiklik için kurumunuzla iletişime geçin; yeni adresinize
          bir doğrulama bağlantısı gelir ve bağlantıyı açtığınızda giriş adresiniz değişir.
        </p>
      </Card>
    </div>
  );
}
