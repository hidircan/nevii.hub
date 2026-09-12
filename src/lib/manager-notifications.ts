/**
 * İş 4 (yönetici bildirim merkezi sprint'i) — yönetici (SCHOOL_ADMIN/
 * SUPER_ADMIN) hedefli olay bildirimleri. `task-notifications.ts` ile AYNI
 * köprü deseni: yeni bir bildirim sistemi KURULMAZ, yalnızca mevcut
 * bildirim yoluna yazar; kimin bildirim alacağı yalnızca
 * `listAdminUserIdsForTenant` (tenant sınırı — User'da branchId yok, şube
 * sorumlusu eşlemesi için veri modeli eksik) ve `isCategoryEnabledForUser`
 * ile belirlenir.
 */
import { listAdminUserIdsForTenant } from "./auth/users";
import { notifyUserIfEnabled, type NotifyOutcome } from "./notification-dispatch";
import { logger } from "./logger";
import type { NotificationCategory } from "./notification-categories";
import type { AppRole } from "./auth/types";

export type NotifyAdminsOptions = {
  /** Olayı tetikleyen yönetici — kendi bildirimi atlanır. */
  excludeUserId?: string;
  /**
   * Aynı kind + dedupeKey için son 24s içinde bildirim varsa tekrar üretme.
   * Örn. paymentId — tarama her çalıştığında spam engeli.
   */
  dedupeKey?: string;
  /** Hedef roller (varsayılan SCHOOL_ADMIN + SUPER_ADMIN). Personel bildirimleri yalnız SUPER_ADMIN. */
  roles?: AppRole[];
};

/**
 * Tenant'ın TÜM yöneticilerine (tercih açıksa) bildirim gönderir.
 *
 * P0 performansı (2026-09-07): yöneticiler BİRBİRİNDEN BAĞIMSIZ hedeflerdir
 * (ayrı `Notification` satırları, ayrı tercih kayıtları), bu yüzden artık
 * paralel yürütülür. Eskiden sıralıydı; gerekçesi json store'da
 * `createNotification`'ın KİLİTSİZ oku-değiştir-yaz olmasıydı — o kök neden
 * kapatıldı (bkz. notifications/index.ts `mutateAllUnderLock`), üstüne
 * türetilmiş satır kimliği ile idempotans eklendi.
 *
 * Tekilleştirme/tercih/hata mantığı burada TEKRARLANMAZ; tek kaynak
 * `notifyUserIfEnabled`. Hiçbir hata sessizce yutulmaz — her hedefin sonucu
 * döner ve başarısızlıklar loglanır.
 */
export async function notifyAdmins(
  tenantId: string,
  category: NotificationCategory,
  notification: { title: string; body: string },
  options?: NotifyAdminsOptions
): Promise<NotifyOutcome[]> {
  try {
    const adminIds = await listAdminUserIdsForTenant(tenantId, options?.roles);
    const targets = adminIds.filter((id) => id !== options?.excludeUserId);
    if (targets.length === 0) return [];

    return await Promise.all(
      targets.map((userId) =>
        notifyUserIfEnabled({
          tenantId,
          userId,
          category,
          title: notification.title,
          body: notification.body,
          dedupeKey: options?.dedupeKey,
        })
      )
    );
  } catch (error) {
    logger.error("notifyAdmins başarısız", {
      tenantId,
      category,
      error: error instanceof Error ? error.message : String(error),
    });
    return ["failed"];
  }
}
