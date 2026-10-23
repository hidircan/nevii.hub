import type { NotificationCategory } from "./notification-categories";
import { createNotification, hasRecentNotification } from "./notifications";
import { isCategoryEnabledForUser } from "./notification-preferences";
import { logger } from "./logger";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Bir bildirim denemesinin AÇIK sonucu. Hiçbir dal sessizce yutulmaz:
 * - `created`   : satır yazıldı
 * - `duplicate` : aynı olay için zaten bildirim vardı (pencere veya idempotans anahtarı)
 * - `skipped`   : kullanıcı bu kategoriyi kapatmış (hata değil, kullanıcı tercihi)
 * - `failed`    : gerçek hata — LOGLANIR ve çağırana bildirilir
 */
export type NotifyOutcome = "created" | "skipped" | "duplicate" | "failed";

export async function notifyUserIfEnabled(input: {
  tenantId: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /**
   * Opsiyonel. Verildiğinde İKİ katmanlı tekilleştirme uygulanır:
   * (1) son `windowMs` içindeki bildirimlere bakan okuma kontrolü — kullanıcıya
   *     görünen kural, davranışı değişmedi;
   * (2) `createNotification`'ın türetilmiş satır kimliği — (1)'i aynı anda
   *     geçen iki eşzamanlı çağrının çift satır yazmasını İMKÂNSIZ kılar.
   * Verilmezse ikisi de uygulanmaz (eski `notifyAdmins` davranışıyla aynı).
   */
  dedupeKey?: string;
  windowMs?: number;
  /**
   * Push köprüsünü atla — yalnız push'u KENDİSİ yöneten çağıranlar
   * (ders hatırlatma sweep'i) kullanır; çift push'u engeller.
   */
  skipPush?: boolean;
}): Promise<NotifyOutcome> {
  try {
    const enabled = await isCategoryEnabledForUser(input.tenantId, input.userId, input.category);
    if (!enabled) return "skipped";

    if (input.dedupeKey !== undefined) {
      const dup = await hasRecentNotification({
        tenantId: input.tenantId,
        userId: input.userId,
        kind: input.category,
        bodyIncludes: input.dedupeKey,
        since: new Date(Date.now() - (input.windowMs ?? DEFAULT_WINDOW_MS)),
      });
      if (dup) return "duplicate";
    }

    const result = await createNotification({
      tenantId: input.tenantId,
      targetUserId: input.userId,
      kind: input.category,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey,
      skipPush: input.skipPush,
    });
    return result.status;
  } catch (error) {
    // Sessiz yutma YOK — hata görünür olur, çağıran `failed`'ı sayıp raporlar.
    logger.error("notifyUserIfEnabled başarısız", {
      tenantId: input.tenantId,
      userId: input.userId,
      category: input.category,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}

/**
 * Öğrencinin KENDİ portal kullanıcısı + velileri. Hedefler birbirinden
 * BAĞIMSIZ (farklı kullanıcı satırları) olduğu için paralel yürütülür;
 * `notifyUserIfEnabled` kendi içinde hata yakaladığı için `Promise.all`
 * burada reddedilmez ve her hedefin sonucu ayrı ayrı döner.
 */
export async function notifyStudentIfEnabled(input: {
  tenantId: string;
  studentId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  dedupeKey?: string;
  windowMs?: number;
  skipPush?: boolean;
}): Promise<NotifyOutcome[]> {
  try {
    const { getUserIdByStudentId, getParentUserIdsByStudentId } = await import("./auth/users");
    // İki arama birbirinden bağımsız salt-okuma — paralel.
    const [studentUserId, parentIds] = await Promise.all([
      getUserIdByStudentId(input.tenantId, input.studentId),
      getParentUserIdsByStudentId(input.tenantId, input.studentId),
    ]);
    const ids = [...new Set<string>([...parentIds, ...(studentUserId ? [studentUserId] : [])])];
    if (ids.length === 0) return [];
    return await Promise.all(ids.map((userId) => notifyUserIfEnabled({ ...input, userId })));
  } catch (error) {
    logger.error("notifyStudentIfEnabled başarısız", {
      tenantId: input.tenantId,
      studentId: input.studentId,
      category: input.category,
      error: error instanceof Error ? error.message : String(error),
    });
    return ["failed"];
  }
}
