import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { getInstitutionContext } from "@/lib/institution/context";
import { roleLabelTr } from "@/lib/auth/role-labels";
import { isDbMode } from "@/lib/config";
import { Card, PageHeader } from "@/components/ui";
import { AccountPasswordForm } from "@/components/account-password-form";
import { AccountEmailChangeForm } from "@/components/account-email-change-form";

export const dynamic = "force-dynamic";

/**
 * Hesabım — İş 2C. Panel navigasyonunun DIŞINDA yeni bir "profile" kavramı
 * icat etmez: mevcut `requireSessionContext`/`getInstitutionContext`
 * desenini kullanır, `panel/layout.tsx` ile AYNI role gate'in altında
 * (SCHOOL_ADMIN/SUPER_ADMIN/TEACHER — panel'e erişebilen roller) render
 * edilir. `User` modelinde ad/telefon/fotoğraf alanı YOK (bkz. şema) —
 * bu tur bunları eklemiyor (PII/şema genişletmesi, migration gerektirir);
 * yalnızca var olan e-posta/rol/kurum bilgisini gösterir. E-posta
 * değişikliği güvenli doğrulama akışıyla yapılır (mevcut şifre + yeni adrese
 * doğrulama bağlantısı + eski adrese güvenlik bildirimi — bkz.
 * `src/lib/auth/email-change.ts`).
 */
export default async function HesabimPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/hesabim");
  }

  const [user, kurum] = await Promise.all([getUserById(session.userId), getInstitutionContext(session)]);
  const currentKurum = kurum.available.find((k) => k.tenantId === session.tenantId);

  return (
    <div>
      <PageHeader title="Hesabım" description="Hesap bilgileriniz ve güvenlik ayarlarınız." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-[var(--color-text)]">Hesap özeti</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--color-text-muted)]">E-posta</dt>
              <dd className="font-medium text-[var(--color-text)]">{user?.email ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--color-text-muted)]">Rol</dt>
              <dd className="font-medium text-[var(--color-text)]">{roleLabelTr(session.role)}</dd>
            </div>
            {currentKurum ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Kurum</dt>
                <dd className="font-medium text-[var(--color-text)]">{currentKurum.name}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-[var(--color-text)]">E-posta değiştir</h2>
          <AccountEmailChangeForm currentEmail={user?.email} />
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-[var(--color-text)]">Şifre değiştir</h2>
          {isDbMode ? (
            <AccountPasswordForm />
          ) : (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning)]">
              Bu ortamda (yerel demo modu — json/memory) şifre değişikliği kalıcı olarak saklanamaz, bu yüzden
              devre dışı. Canlı (veritabanı) modda kullanılabilir.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
