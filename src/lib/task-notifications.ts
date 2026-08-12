/**
 * İş Takip → mevcut kurum-içi bildirim altyapısına (src/lib/notifications)
 * KÖPRÜ — yeni bir bildirim sistemi KURULMAZ, yalnızca `createNotification`
 * çağrılır.
 *
 * Faz 2: yalnızca "sorumlu atandı" olayı (event-driven, ctx tabanlı yazma
 * anında tetiklenir).
 * Faz 3A: DUE_SOON/DUE_TODAY/OVERDUE hatırlatmaları — bunlar zamana bağlı
 * olduğu için AYRI, güvenli bir tetikleyiciye ihtiyaç duyar: bkz.
 * `/api/v1/tasks/reminders/tick` (src/app/api/v1/tasks/reminders/tick/route.ts)
 * — `/panel/workflows` (AI otomasyonu) ile İLGİSİZ, kasıtlı olarak ayrı bir
 * uç nokta (gerekçe teslim raporunda).
 */

import { isDbMode } from "./config";
import type { TaskReminderKind } from "./task-reminders";
import { buildTaskReminderText, taskReminderNotificationKind } from "./task-reminders";
import { recordReminderIfNew } from "./task-reminder-log";
import { getReminderPreference } from "./task-reminder-preferences";

/**
 * `assigneeId` bir Teacher.id (öğretmen personel) VEYA doğrudan bir
 * User.id (admin) olabilir (bkz. src/lib/types.ts Task.assigneeId yorumu).
 * Bildirim `Notification.targetUserId` bir User.id BEKLEDİĞİ için, bir
 * Teacher.id verilmişse önce ilgili User kaydı bulunur. Eşleşme yoksa
 * (ör. o öğretmenin login hesabı yok) sessizce `undefined` döner —
 * bildirim oluşturulmaz, hata da fırlatılmaz (best-effort, kritik yola
 * blokaj yapmaz — audit/task işlemi bundan etkilenmemeli).
 */
export async function resolveTaskNotifyUserId(
  tenantId: string,
  assigneeId: string | undefined
): Promise<string | undefined> {
  if (!assigneeId) return undefined;
  try {
    if (isDbMode) {
      const { prisma } = await import("./db");
      const byUserId = await prisma.user.findFirst({ where: { id: assigneeId, tenantId } });
      if (byUserId) return byUserId.id;
      const byTeacherId = await prisma.user.findFirst({ where: { teacherId: assigneeId, tenantId } });
      return byTeacherId?.id;
    }
    // json/memory demo modu — dinamik bir User tablosu yok, sabit bootstrap
    // kimlikleri var (bkz. src/lib/auth/users.ts). Yalnızca OKUNUR, hiçbir
    // alan değiştirilmez/eklenmez.
    const { getBootstrapUsersForSeed } = await import("./auth/users");
    const users = getBootstrapUsersForSeed(tenantId);
    if (users.some((u) => u.id === assigneeId)) return assigneeId;
    return users.find((u) => u.teacherId === assigneeId)?.id;
  } catch {
    return undefined;
  }
}

/**
 * Bir sorumlunun (assigneeId — Teacher.id veya User.id) hâlâ AKTİF olup
 * olmadığını kontrol eder — arşivlenmiş öğretmene/pasif kullanıcıya yeni
 * hatırlatma ÜRETİLMEZ (madde 1). Bilinmeyen bir kimlik de "aktif değil"
 * sayılır (fail-closed — sessizce yanlış kişiye bildirim gitmesin).
 */
export async function isTaskAssigneeActive(tenantId: string, assigneeId: string): Promise<boolean> {
  try {
    if (isDbMode) {
      const { prisma } = await import("./db");
      const asUser = await prisma.user.findFirst({ where: { id: assigneeId, tenantId } });
      if (asUser) return asUser.active;
      const teacher = await prisma.teacher.findFirst({ where: { id: assigneeId, tenantId } });
      if (teacher) return teacher.active;
      return false;
    }
    const { readData } = await import("./store");
    const { runWithTenantAsync } = await import("./tenant-context");
    const data = await runWithTenantAsync(tenantId, () => readData());
    const teacher = data.teachers.find((t) => t.id === assigneeId);
    if (teacher) return teacher.active;
    // Bootstrap admin kimlikleri (json/memory) her zaman aktif kabul edilir —
    // bu demo modunda pasifleştirme mekanizması yok.
    const { getBootstrapUsersForSeed } = await import("./auth/users");
    return getBootstrapUsersForSeed(tenantId).some((u) => u.id === assigneeId);
  } catch {
    return false;
  }
}

/**
 * DUE_SOON/DUE_TODAY/OVERDUE hatırlatması — tercihe tabi, tekilleştirilmiş.
 * Sıra ÖNEMLİ: önce tekilleştirme kaydı (aynı gün/tür için ikinci bir
 * çağrıda kesin olarak atlanır), sonra aktiflik, sonra tercih, sonra
 * kullanıcı çözümleme. Herhangi bir adımda "hayır" ise sessizce atlanır —
 * hiçbiri hata fırlatmaz (tick'in batch'i tek bir görev/kullanıcı yüzünden
 * durmamalı, bkz. tick endpoint'i).
 *
 * @returns "created" (yeni bildirim üretildi), "duplicate" (zaten vardı,
 *   tekilleştirmeyle atlandı) veya "skipped" (aktif değil/tercih kapalı/
 *   kullanıcı çözülemedi).
 */
export async function notifyTaskReminder(input: {
  tenantId: string;
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  kind: TaskReminderKind;
  calendarDay: string;
}): Promise<"created" | "duplicate" | "skipped"> {
  const targetUserId = await resolveTaskNotifyUserId(input.tenantId, input.assigneeId);
  if (!targetUserId) return "skipped";

  const active = await isTaskAssigneeActive(input.tenantId, input.assigneeId);
  if (!active) return "skipped";

  const preference = await getReminderPreference(input.tenantId, targetUserId);
  const preferenceKey =
    input.kind === "DUE_SOON" ? "dueSoonEnabled" : input.kind === "DUE_TODAY" ? "dueTodayEnabled" : "overdueEnabled";
  if (!preference[preferenceKey]) return "skipped";

  // Tekilleştirme anahtarı targetUserId (ÇÖZÜLMÜŞ User.id) ile — sorumlu bir
  // Teacher.id olsa bile hatırlatma HER ZAMAN aynı kişiye/gün/türe göre
  // tekilleşir; sorumlu değişirse yeni bir User.id → yeni anahtar → eski
  // sorumluya asla tekrar bildirim gitmez, yeni sorumluya aynı gün bile
  // gidebilir (ayrı görev/kişi kombinasyonu).
  const isNew = await recordReminderIfNew({
    tenantId: input.tenantId,
    taskId: input.taskId,
    assigneeUserId: targetUserId,
    kind: input.kind,
    calendarDay: input.calendarDay,
  });
  if (!isNew) return "duplicate";

  try {
    const { createNotification } = await import("./notifications");
    const { title, body } = buildTaskReminderText(input.kind, input.taskTitle, input.taskId);
    await createNotification({
      tenantId: input.tenantId,
      targetUserId,
      kind: taskReminderNotificationKind(input.kind),
      title,
      body,
    });
    return "created";
  } catch {
    // Bildirim yazımı başarısız olsa bile tekilleştirme kaydı zaten
    // oluşturuldu — bu, aynı hatırlatmanın sonsuz tekrar denenmesini
    // engeller (en kötü ihtimalle o gün için o hatırlatma kaçırılır,
    // ertesi gün/tür için yeniden denenir — asla spam olmaz).
    return "skipped";
  }
}

/**
 * Sorumlu atandığında bildirim — best-effort, hata fırlatmaz.
 * `task_new_assignment` kategori tercihi kapalıysa oluşturmaz (İş 4).
 * kind: `task_new_assignment` (eski `task_assigned` ile href çözümlemesi uyumlu).
 */
export async function notifyTaskAssigned(
  tenantId: string,
  assigneeId: string | undefined,
  taskTitle: string,
  taskId?: string
): Promise<void> {
  const targetUserId = await resolveTaskNotifyUserId(tenantId, assigneeId);
  if (!targetUserId) return;
  try {
    const { isCategoryEnabledForUser } = await import("./notification-preferences");
    const enabled = await isCategoryEnabledForUser(tenantId, targetUserId, "task_new_assignment");
    if (!enabled) return;

    const { createNotification } = await import("./notifications");
    const detail = taskId ? ` Detay: /panel/is-takip/${taskId}` : " Detay: /panel/is-takip";
    await createNotification({
      tenantId,
      targetUserId,
      kind: "task_new_assignment",
      title: "Yeni görev atandı",
      body: `"${taskTitle}" görevi size atandı.${detail}`,
    });
  } catch {
    // best-effort — bildirim oluşturulamasa bile görev ataması geçerli kalır.
  }
}
