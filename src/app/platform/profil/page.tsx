import { Card, PageHeader } from "@/components/ui";
import { requireHyperAdminPage } from "@/lib/platform/session";
import { getUserById } from "@/lib/auth/users";
import { roleLabelTr } from "@/lib/auth/role-labels";
import { getUserLifecycle } from "@/lib/platform/store-ext";
import { isDbMode } from "@/lib/config";
import { ChangePasswordForm } from "@/components/platform/change-password-form";

export const dynamic = "force-dynamic";

export default async function PlatformProfilePage() {
  const session = await requireHyperAdminPage("/platform/profil");
  const [user, lifecycle] = await Promise.all([getUserById(session.userId), getUserLifecycle(session.userId).catch(() => null)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Profilim" description="Hesap bilgileri ve güvenlik." />
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--color-text-muted)]">Ad soyad</dt>
          <dd>{lifecycle?.displayName ?? "henüz yapılandırılmadı"}</dd>
          <dt className="text-[var(--color-text-muted)]">E-posta</dt>
          <dd>{user?.email ?? "—"}</dd>
          <dt className="text-[var(--color-text-muted)]">Rol</dt>
          <dd>{roleLabelTr(session.role)}</dd>
        </dl>
      </Card>
      <Card>
        <h2 id="sifre" className="text-sm font-semibold">Şifre değiştir</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Başarılı değişiklikte diğer tüm cihazlardaki oturumlar kapatılır; bu oturum yeni token ile devam eder.
          {isDbMode ? "" : " (json/memory demo modunda şifre kalıcı değiştirilemez.)"}
        </p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
