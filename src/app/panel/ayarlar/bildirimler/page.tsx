import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSessionContext, notificationSettingsPathForRole } from "@/lib/auth/session";
import { getNotificationPreferences } from "@/lib/notification-preferences";
import { PageHeader } from "@/components/ui";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { TaskReminderPreferencesModal } from "@/components/task-reminder-preferences-modal";
import { ContractExpiryDaysSetting } from "@/components/contract-expiry-days-setting";
import { resolveSetting } from "@/lib/platform/resolve";
import { STUDENT_CONTRACT_EXPIRY_SETTING_KEY, parseExpiryDays } from "@/lib/student-contract-expiry";

export const dynamic = "force-dynamic";

/**
 * Bildirim ayarları — user-level, tenant-safe tercih ekranı.
 * SCHOOL_ADMIN / SUPER_ADMIN / TEACHER (panel erişimi olanlar).
 * Push yok; in-app kategori tercihleri + iş takip hatırlatma modalı bağlantısı.
 */
export default async function BildirimAyarlariPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/bildirimler");
  }

  if (session.role === "STUDENT") {
    redirect(notificationSettingsPathForRole(session.role));
  }

  const preferences = await getNotificationPreferences(session.tenantId, session.userId);
  const isAdmin = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const expiryDays = isAdmin
    ? parseExpiryDays((await resolveSetting({ tenantId: session.tenantId }, STUDENT_CONTRACT_EXPIRY_SETTING_KEY))?.effectiveValue)
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Bildirim ayarları"
        description="Hangi uygulama içi bildirimleri alacağınızı kategori bazında seçin. Tercihler yalnızca size aittir."
      />

      <NotificationPreferencesForm role={session.role} initialPreferences={preferences} />

      {expiryDays !== null ? <ContractExpiryDaysSetting initialDays={expiryDays} canEdit={isAdmin} /> : null}

      <div
        className="mt-8 rounded-[var(--radius-lg)] border p-4 sm:p-5"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          İş takip hatırlatmaları
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          Son tarihi yaklaşan / bugün / gecikmiş görev hatırlatmaları ayrı bir tercih setidir (tick
          endpoint + tekilleştirme logu). Buradan yönetebilirsiniz:
        </p>
        <div className="mt-3">
          <TaskReminderPreferencesModal />
        </div>
      </div>

      <p className="mt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <Link href="/panel/hesabim" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
          ← Hesabıma dön
        </Link>
      </p>
    </div>
  );
}
