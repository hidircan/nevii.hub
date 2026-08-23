import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionContext, notificationSettingsPathForRole } from "@/lib/auth/session";
import { getNotificationPreferences } from "@/lib/notification-preferences";
import { Card, PageHeader } from "@/components/ui";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { AccountPasswordForm } from "@/components/account-password-form";

export const dynamic = "force-dynamic";

export default async function OgrenciBildirimAyarlariPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/ayarlar/bildirimler");
  }

  // Only students may access this route — other roles go to their own settings page.
  if (session.role !== "STUDENT") {
    redirect(notificationSettingsPathForRole(session.role));
  }

  const preferences = await getNotificationPreferences(session.tenantId, session.userId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Bildirim ayarları"
        description="Hangi uygulama içi bildirimleri alacağınızı kategori bazında seçin. Tercihler yalnızca size aittir."
      />

      <NotificationPreferencesForm
        role={session.role}
        initialPreferences={preferences.map((p) => ({ category: p.category, inAppEnabled: p.inAppEnabled, pushEnabled: p.pushEnabled }))}
      />

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-[var(--color-text)]">Şifre değiştir</h2>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Portal erişiminiz bir yönetici tarafından geçici bir şifreyle oluşturulduysa, ilk girişinizde şifrenizi
          buradan kendi belirlediğiniz bir şifreyle değiştirmenizi öneririz.
        </p>
        <AccountPasswordForm />
      </Card>

      <p className="mt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <Link href="/ogrenci" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
          ← Öğrenci paneline dön
        </Link>
      </p>
    </div>
  );
}
