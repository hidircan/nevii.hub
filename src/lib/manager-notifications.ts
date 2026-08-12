/**
 * İş 4 (yönetici bildirim merkezi sprint'i) — yönetici (SCHOOL_ADMIN/
 * SUPER_ADMIN) hedefli olay bildirimleri. `task-notifications.ts` ile AYNI
 * köprü deseni: yeni bir bildirim sistemi KURULMAZ, yalnızca mevcut
 * `createNotification`'a yazar; kimin bildirim alacağı yalnızca
 * `listAdminUserIdsForTenant` (tenant sınırı — User'da branchId yok, şube
 * sorumlusu eşlemesi için veri modeli eksik) ve `isCategoryEnabledForUser`
 * ile belirlenir.
 */
import { listAdminUserIdsForTenant } from "./auth/users";
import { isCategoryEnabledForUser } from "./notification-preferences";
import type { NotificationCategory } from "./notification-categories";

export type NotifyAdminsOptions = {
  /** Olayı tetikleyen yönetici — kendi bildirimi atlanır. */
  excludeUserId?: string;
  /**
   * Aynı kind + dedupeKey için son 24s içinde bildirim varsa tekrar üretme.
   * Örn. paymentId — tarama her çalıştığında spam engeli.
   */
  dedupeKey?: string;
};

/**
 * Tenant'ın TÜM yöneticilerine (tercih açıksa) bildirim gönderir.
 * Best-effort: tek kullanıcı hatası diğerlerini veya çağıran işlemi bozmaz.
 */
export async function notifyAdmins(
  tenantId: string,
  category: NotificationCategory,
  notification: { title: string; body: string },
  options?: NotifyAdminsOptions
): Promise<void> {
  try {
    const adminIds = await listAdminUserIdsForTenant(tenantId);
    const targets = adminIds.filter((id) => id !== options?.excludeUserId);
    if (targets.length === 0) return;

    const { createNotification, listNotificationsForUser } = await import("./notifications");
    const body = notification.body;
    const since = Date.now() - 24 * 60 * 60 * 1000;

    // Sıralı yazma — json store'da Promise.all + createNotification load/save
    // yarışı son yazanın kazanmasına yol açar (diğer admin bildirimleri kaybolur).
    for (const userId of targets) {
      try {
        const enabled = await isCategoryEnabledForUser(tenantId, userId, category);
        if (!enabled) continue;

        if (options?.dedupeKey) {
          const existing = await listNotificationsForUser({ tenantId, userId });
          const dup = existing.some(
            (n) =>
              n.kind === category &&
              n.body.includes(options.dedupeKey!) &&
              new Date(n.createdAt).getTime() >= since
          );
          if (dup) continue;
        }

        await createNotification({
          tenantId,
          targetUserId: userId,
          kind: category,
          title: notification.title,
          body,
        });
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort
  }
}
