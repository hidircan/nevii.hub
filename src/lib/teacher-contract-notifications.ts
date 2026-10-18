/**
 * PRODUCT_BACKLOG §3.3 — öğretmen sözleşme bitiş hatırlatması → mevcut
 * kurum-içi bildirim altyapısına (`src/lib/notifications`) KÖPRÜ, tıpkı
 * `task-notifications.ts` gibi: yeni bir bildirim sistemi KURULMAZ.
 * Öğretmene/veliye dış mesaj (WhatsApp/e-posta) ASLA gönderilmez — yalnızca
 * tenant'ın TÜM SCHOOL_ADMIN/SUPER_ADMIN kullanıcılarına uygulama içi
 * bildirim.
 */

import { listAdminUserIdsForTenant } from "./auth/users";
import {
  buildTeacherContractReminderKind,
  buildTeacherContractReminderText,
} from "./teacher-contract-reminders";

export type NotifyTeacherContractReminderInput = {
  tenantId: string;
  teacherId: string;
  teacherName: string;
  contractEndDate: string;
  daysLeft: number;
};

export type NotifyTeacherContractReminderResult = {
  recipientsNotified: number;
  duplicatesSkipped: number;
};

/**
 * Tenant'ın tüm yöneticilerine (SCHOOL_ADMIN + SUPER_ADMIN) bildirim üretir.
 * Tekilleştirme anahtarı KESİN OLARAK (tenantId, targetUserId=recipientUserId,
 * kind) üçlüsüdür — `kind` alanı `teacherId` + `contractEndDate`'i kodlar
 * (bkz. `buildTeacherContractReminderKind`), böylece:
 *   - aynı tick tekrar çalışınca (aynı teacherId+contractEndDate+admin) →
 *     `listNotificationsForUser` içinde aynı `kind` zaten var → atlanır.
 *   - sözleşme bitiş tarihi değişirse → `kind` değişir → yeni bildirim.
 * Sıralı yazılır (json store'da paralel create/save yarışı son yazanın
 * kazanmasına yol açar — `manager-notifications.ts` ile AYNI gerekçe).
 */
export async function notifyTeacherContractReminder(
  input: NotifyTeacherContractReminderInput
): Promise<NotifyTeacherContractReminderResult> {
  const result: NotifyTeacherContractReminderResult = { recipientsNotified: 0, duplicatesSkipped: 0 };

  const adminIds = await listAdminUserIdsForTenant(input.tenantId);
  if (adminIds.length === 0) return result;

  const kind = buildTeacherContractReminderKind(input.teacherId, input.contractEndDate);
  const { title, body } = buildTeacherContractReminderText(
    input.teacherName,
    input.teacherId,
    input.contractEndDate,
    input.daysLeft
  );

  const { createNotification, hasRecentNotification } = await import("./notifications");

  for (const userId of adminIds) {
    try {
      // DB egress (2026-10-18): yöneticinin tüm bildirimleri (binlerce satır) yerine aynı "bu tür var mı" kuralı SQL'de.
      const isDuplicate = await hasRecentNotification({ tenantId: input.tenantId, userId, kind, bodyIncludes: "", since: new Date(0) });
      if (isDuplicate) {
        result.duplicatesSkipped++;
        continue;
      }
      await createNotification({
        tenantId: input.tenantId,
        targetUserId: userId,
        kind,
        title,
        body,
      });
      result.recipientsNotified++;
    } catch {
      // best-effort — bir yönetici için yazma hatası diğerlerini/tick'i durdurmaz.
    }
  }

  return result;
}
