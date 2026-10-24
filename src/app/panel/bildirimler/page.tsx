import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { listNotificationsPageForUser } from "@/lib/notifications";
import { NotificationsList } from "@/components/notifications-list";

export const dynamic = "force-dynamic";

/**
 * Bildirimler — uygulama içi ders/telafi/görev/tahsilat/duyuru/sistem
 * olaylarının tam listesi (bell dropdown yalnızca son 20'sini gösterir).
 * Dış SMS/WhatsApp iletişimi burada DEĞİL — bkz. `/panel/iletisim-merkezi`.
 * Yalnızca çağıranın kendi (tenant, userId) kapsamındaki bildirimleri
 * (`listNotificationsPageForUser` zaten bu kapsamla filtreliyor).
 * DB egress (2026-10-18): yöneticide binlerce satır birikiyor (canlı: 2 605 satır ≈ 0,7 MB/açılış) → en yeni
 * `PAGE_LIMIT` bildirim okunur; süzgeç/arama bu pencerede çalışır.
 */
const PAGE_LIMIT = 300;
export default async function BildirimlerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/bildirimler");
  }

  const { notifications, nextCursor } = await listNotificationsPageForUser(
    { tenantId: session.tenantId, userId: session.userId, studentId: session.studentId },
    { limit: PAGE_LIMIT }
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Bildirimler" description="Uygulama içi ders, telafi, görev, tahsilat, duyuru ve sistem bildirimleriniz." />
      <NotificationsList initialNotifications={notifications} />
      {nextCursor ? (
        <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">En yeni {PAGE_LIMIT} bildirim gösteriliyor; daha eskileri listede yer almaz.</p>
      ) : null}
    </div>
  );
}
