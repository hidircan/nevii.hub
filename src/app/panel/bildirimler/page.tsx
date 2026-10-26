import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireSessionContext } from "@/lib/auth/session";
import { listNotificationsForUser } from "@/lib/notifications";
import { NotificationsList } from "@/components/notifications-list";

export const dynamic = "force-dynamic";

/**
 * Bildirimler — uygulama içi ders/telafi/görev/tahsilat/duyuru/sistem
 * olaylarının tam listesi (bell dropdown yalnızca son 20'sini gösterir).
 * Dış SMS/WhatsApp iletişimi burada DEĞİL — bkz. `/panel/iletisim-merkezi`.
 * Yalnızca çağıranın kendi (tenant, userId) kapsamındaki bildirimleri
 * (`listNotificationsForUser` zaten bu kapsamla filtreliyor).
 */
export default async function BildirimlerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/bildirimler");
  }

  const notifications = await listNotificationsForUser({
    tenantId: session.tenantId,
    userId: session.userId,
    studentId: session.studentId,
  });

  return (
    <div>
      <PageHeader title="Bildirimler" description="Uygulama içi ders, telafi, görev, tahsilat, duyuru ve sistem bildirimleriniz." />
      <NotificationsList initialNotifications={notifications} />
    </div>
  );
}
