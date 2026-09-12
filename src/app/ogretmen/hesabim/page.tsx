import { redirect } from "next/navigation";
import { requireSessionContext, notificationSettingsPathForRole } from "@/lib/auth/session";
import { getUserById } from "@/lib/auth/users";
import { Card, PageHeader } from "@/components/ui";
import { AccountEmailChangeForm } from "@/components/account-email-change-form";

export const dynamic = "force-dynamic";

/**
 * Öğretmen Hesabım — e-posta değiştirme. Paneldeki `/panel/hesabim` ile AYNI
 * güvenli akış (mevcut şifre + yeni adrese doğrulama + eski adrese bildirim);
 * userId session'dan gelir.
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
      <PageHeader title="Hesabım" description="Giriş e-postanızı güvenli doğrulamayla değiştirin." />
      <Card>
        <h2 className="mb-4 font-semibold text-[var(--color-text)]">E-posta değiştir</h2>
        <AccountEmailChangeForm currentEmail={user?.email} />
      </Card>
    </div>
  );
}
