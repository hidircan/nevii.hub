import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionContext, notificationSettingsPathForRole } from "@/lib/auth/session";
import { getNotificationPreferences } from "@/lib/notification-preferences";
import { PageHeader } from "@/components/ui";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";

export const dynamic = "force-dynamic";

export default async function OgretmenBildirimAyarlariPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogretmen/ayarlar/bildirimler");
  }

  // Only teachers may access this route. Unauthenticated users are handled above.
  if (session.role !== "TEACHER") {
    // Map other roles to their appropriate home path to avoid exposing the teacher page.
    // Use the centralized helper to keep routing consistent across the app.
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

      <p className="mt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <Link href="/ogretmen" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
          ← Öğretmen paneline dön
        </Link>
      </p>
    </div>
  );
}
