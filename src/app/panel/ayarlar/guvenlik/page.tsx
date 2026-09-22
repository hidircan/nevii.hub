import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { CriticalActionPasswordForm } from "@/components/critical-action-password-form";
import { requireSessionContext } from "@/lib/auth/session";
import { getCriticalActionPasswordStatus } from "@/lib/critical-action-password";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Kurum sahibi — kritik işlem şifresi (öğrenci silme gibi geri dönüşü zor işlemler). */
export default async function SecuritySettingsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/guvenlik");
  }
  if (session.role !== "SUPER_ADMIN") redirect("/panel");
  const status = await getCriticalActionPasswordStatus(session.tenantId);

  return (
    <div>
      <div className="mb-3">
        <BackButton fallbackHref="/panel/kurulum" label="Kuruluma dön" />
      </div>
      <PageHeader
        title="Güvenlik"
        description="Öğrenci silme gibi kritik işlemler giriş şifrenizden AYRI bir kritik işlem şifresi ister. Şifre yalnız şifrelenmiş (hash) olarak saklanır."
      />
      <CriticalActionPasswordForm
        configured={status.configured}
        setAtLabel={status.setAt ? formatDateTime(status.setAt) : undefined}
      />
    </div>
  );
}
