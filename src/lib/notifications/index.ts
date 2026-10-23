/**
 * EPIC 1 (IMPLEMENTATION_PLAN.md) — uygulama içi bildirimler.
 * STORE_MODE=db  → Prisma Notification (kalıcı, production)
 * STORE_MODE=json/memory → dosya tabanlı store (demo)
 * Erişim her zaman tenantId + (targetUserId veya targetStudentId) ile
 * kapsamlanır — bkz. listNotificationsForUser.
 */

import path from "path";
import { createHash } from "crypto";
import { isDbMode, resolveDataDir } from "../config";
import { withFileLock, writeJsonFileAtomic } from "../atomic-json-file";
/**
 * `../db` ve `@prisma/client` DİNAMİK import edilir, ama çözümleme süreç
 * başına BİR KEZ yapılır (promise memoize edilir).
 *
 * Neden statik değil: bu modül `/ogrenci`, `/panel/bildirimler`, export
 * route'u ve `services/tools.ts` üzerinden neredeyse tüm sayfa grafiğine
 * giriyor. Statik import, `@prisma/client`'ı json/memory deploy'larında da
 * her sayfanın modül grafiğine sokar; dinamik + memoize, aynı "yazım başına
 * modül çözümlemesi yok" kazancını bu bedeli ödemeden verir.
 *
 * (Not: statik hâli bir tur denendi ve dağıtımı BOZMADI — o dağıtım 120
 * saniyede READY oldu. Geri alınmasının sebebi ölçülmüş bir hata değil,
 * yukarıdaki modül-grafiği gerekçesidir.)
 */
type DbModules = {
  prisma: typeof import("../db").prisma;
  Prisma: typeof import("@prisma/client").Prisma;
};

/** Promise MEMOİZE edilir: süreç başına tek çözümleme (eskiden yazım başına bir tane). */
let dbModules: Promise<DbModules> | null = null;

function db(): Promise<DbModules> {
  dbModules ??= Promise.all([import("../db"), import("@prisma/client")]).then(
    ([dbModule, prismaModule]) => ({ prisma: dbModule.prisma, Prisma: prismaModule.Prisma })
  );
  return dbModules;
}
import { uid } from "../utils";
import { logger } from "../logger";
import { isNotificationCategory } from "../notification-categories";
import type { Notification as DbNotification } from "@prisma/client";
import type { Notification } from "../types";

const FILE = path.join(
  resolveDataDir(path.join(process.cwd(), "data")),
  "notifications.json"
);

/** Resolved store path — exposed so tests clean up the same file the module writes. */
export const NOTIFICATIONS_FILE = FILE;

type StoredNotification = Notification & { tenantId: string };

async function loadAll(): Promise<StoredNotification[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredNotification[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredNotification[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await writeJsonFileAtomic(FILE, rows);
}

/**
 * P0 (2026-09-07) — json/memory yolundaki HER oku-değiştir-yaz bu kilidin
 * altından geçmelidir. Öncesinde `loadAll()` + `saveAll(...)` kilitsizdi:
 * aynı anda iki yazımdan biri SESSİZCE KAYBOLUYORDU. Bu, ders taşıma
 * bildirimlerini paralelleştirme denemesinde ölçülerek görülmüş, o zaman
 * düzeltme yerine paralelleştirme geri alınmıştı
 * (bkz. docs/performance/ADMIN_WEB_P0_BASELINE.md §7.9) — burada kök neden
 * kapatılıyor. `store-json.ts` ile AYNI iki katmanlı desen: kilit + atomik
 * (geçici dosya + rename) yazım.
 */
async function mutateAllUnderLock<T>(
  fn: (rows: StoredNotification[]) => { next: StoredNotification[] | null; result: T }
): Promise<T> {
  return withFileLock(FILE, async () => {
    const all = await loadAll();
    const { next, result } = fn(all);
    if (next) await saveAll(next);
    return result;
  });
}

function toIso(date: Date | null): string | undefined {
  return date ? date.toISOString() : undefined;
}

function mapDbNotification(n: DbNotification): StoredNotification {
  return {
    id: n.id,
    tenantId: n.tenantId,
    targetUserId: n.targetUserId ?? undefined,
    targetStudentId: n.targetStudentId ?? undefined,
    kind: n.kind,
    title: n.title,
    body: n.body,
    readAt: toIso(n.readAt),
    createdAt: n.createdAt.toISOString(),
  };
}

function toPublicNotification(n: StoredNotification): Notification {
  return {
    id: n.id,
    targetUserId: n.targetUserId,
    targetStudentId: n.targetStudentId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

export type CreateNotificationInput = {
  tenantId: string;
  targetUserId?: string;
  targetStudentId?: string;
  kind: string;
  title: string;
  body: string;
  /**
   * İdempotans anahtarı (opsiyonel). Verilirse satır id'si
   * (tenant, hedef, kind, anahtar, GÜN) beşlisinden TÜRETİLİR. `Notification.id`
   * birincil anahtar olduğu için aynı beşliye ikinci bir satır YAZILAMAZ —
   * şema değişikliği (yeni unique index/migration) GEREKMEDEN yarış koşullarına
   * dayanıklı tekilleştirme.
   *
   * Bu, `notification-dispatch.ts`'teki 24 saatlik pencere kontrolünün YERİNE
   * GEÇMEZ; onun ALTINA konan sert bir emniyettir. Pencere kontrolü kullanıcıya
   * görünen kuralı (aynı olay 24 saatte bir kez) korur; buradaki id ise iki
   * eşzamanlı çağrının o kontrolü aynı anda geçip ÇİFT satır yazmasını
   * imkânsız kılar. Gün bileşeni sayesinde 24 saatten sonraki meşru bir
   * tekrar bildirimi engellenmez.
   */
  dedupeKey?: string;
  /**
   * Push köprüsünü ATLA. Yalnız push'u kendisi yöneten çağıranlar kullanır
   * (ders hatırlatma sweep'i: PII-minimize + alıcı doğrulaması + ayrı
   * `pushSent` sayacı). Verilmezse satır `created` olduğunda push da
   * gönderilir (`push/sender.ts` — `PUSH_ENABLED` kapalıysa sessizce atlanır).
   */
  skipPush?: boolean;
};

export type CreateNotificationResult = {
  /** `duplicate` → aynı idempotans anahtarıyla satır ZATEN vardı, yeni satır yazılmadı. */
  status: "created" | "duplicate";
  notification: Notification;
};

/**
 * Satır kimliği. `dedupeKey` yoksa davranış eskisiyle aynıdır (rastgele id),
 * yani idempotans anahtarı vermeyen çağıranların semantiği DEĞİŞMEZ.
 */
/**
 * Prisma'nın benzersizlik ihlali kodu — SADECE bu kod `duplicate`'e çevrilir.
 * `Prisma` namespace'i çağıran tarafından geçirilir (dinamik import, yukarı bkz.).
 */
function isUniqueViolation(
  PrismaNs: typeof import("@prisma/client").Prisma,
  error: unknown
): boolean {
  return error instanceof PrismaNs.PrismaClientKnownRequestError && error.code === "P2002";
}

function notificationRowId(input: CreateNotificationInput, now: Date): string {
  if (!input.dedupeKey) return uid("notif");
  const target = input.targetUserId ?? input.targetStudentId ?? "";
  const day = now.toISOString().slice(0, 10);
  const digest = createHash("sha256")
    .update([input.tenantId, target, input.kind, input.dedupeKey, day].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
  return `notif_${digest}`;
}

/** targetUserId'ye VEYA targetStudentId'ye göre — tenant içinde kişiye özel bildirimler. */
export type NotificationRecipient = {
  tenantId: string;
  userId?: string;
  studentId?: string;
};

async function createNotificationDb(
  input: CreateNotificationInput,
  record: StoredNotification
): Promise<CreateNotificationResult> {
  const { prisma, Prisma } = await db();
  /**
   * TEK ifade, TEK gidiş-dönüş: `create`. (`createMany(skipDuplicates)`
   * denendi ve ÖLÇÜMLE geri alındı — Prisma onu `BEGIN/INSERT/COMMIT` olarak
   * gönderiyor, yani bildirim başına 1 yerine 3 gidiş-dönüş: taşıma yolunda
   * +10 sorgu.)
   *
   * Birincil anahtar çakışması burada bir HATA değil, tanımlı bir SONUÇTUR:
   * yalnız `P2002` (unique constraint) yakalanır ve `duplicate`'e çevrilir;
   * başka her hata olduğu gibi YUKARI FIRLATILIR (sessiz yutma yok).
   */
  try {
    const row = await prisma.notification.create({
      data: {
        id: record.id,
        tenantId: input.tenantId,
        targetUserId: input.targetUserId ?? null,
        targetStudentId: input.targetStudentId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body,
      },
    });
    return { status: "created", notification: toPublicNotification(mapDbNotification(row)) };
  } catch (error) {
    if (!isUniqueViolation(Prisma, error)) throw error;
  }

  // Yinelenen: dönen nesne UYDURULMAZ, gerçekten saklanan satır okunur.
  const existing = await prisma.notification.findFirst({
    where: { id: record.id, tenantId: input.tenantId },
  });
  return {
    status: "duplicate",
    notification: existing ? toPublicNotification(mapDbNotification(existing)) : toPublicNotification(record),
  };
}

/**
 * Üç modda da AYNI sözleşme: `dedupeKey` verilmişse aynı (tenant, hedef, kind,
 * anahtar, gün) beşlisi için EN FAZLA BİR satır oluşur ve ikinci çağrı
 * `duplicate` döner. db'de bunu birincil anahtar, json/memory'de aynı id'nin
 * kilit ALTINDA aranması sağlar — ikisi de yarışa dayanıklıdır.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<CreateNotificationResult> {
  const record: StoredNotification = {
    id: notificationRowId(input, new Date()),
    tenantId: input.tenantId,
    targetUserId: input.targetUserId,
    targetStudentId: input.targetStudentId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
  };
  let result: CreateNotificationResult;
  if (isDbMode) {
    result = await createNotificationDb(input, record);
  } else {
    result = await mutateAllUnderLock<CreateNotificationResult>((all) => {
      const existing = all.find((n) => n.id === record.id);
      if (existing) {
        return { next: null, result: { status: "duplicate", notification: toPublicNotification(existing) } };
      }
      return { next: [...all, record], result: { status: "created", notification: toPublicNotification(record) } };
    });
  }
  // Yeni satır → push. Tekilleştirilmiş (`duplicate`) satırda push YOK:
  // aynı olayın ikinci bildirimi kullanıcının tepsini tekrar çalmamalı.
  // Hata bildirim yazımını ASLA bozmaz (helper kendi içinde yutar + loglar).
  if (result.status === "created" && !input.skipPush) {
    await deliverPushForNotification(record);
  }
  return result;
}

/**
 * Push köprüsü — bildirim satırı yazıldıktan sonra cihazlara da düşürür.
 * `PUSH_ENABLED=true` + `EXPO_PUSH_ACCESS_TOKEN` yoksa HİÇBİR HTTP çağrısı
 * yapılmaz (mevcut davranış korunur). Kategori tercihi `pushEnabled=false`
 * ise gönderim yoktur (bkz. push/sender.ts). Ham push token'ı loglanmaz.
 */
async function deliverPushForNotification(record: StoredNotification): Promise<void> {
  if (!isNotificationCategory(record.kind)) return;
  try {
    const { isPushActive } = await import("../push/config");
    if (!isPushActive()) return;
    const userId = record.targetUserId
      ? record.targetUserId
      : record.targetStudentId
        ? await (await import("../auth/users")).getUserIdByStudentId(record.tenantId, record.targetStudentId)
        : null;
    if (!userId) return;
    const [{ deliverPushForUser }, { pushChannelForCategory }] = await Promise.all([
      import("../push/sender"),
      import("../push/channels"),
    ]);
    const result = await deliverPushForUser(record.tenantId, userId, record.kind, {
      title: record.title,
      body: record.body,
      data: { kind: record.kind },
      channelId: pushChannelForCategory(record.kind),
    });
    if (result.outcome === "failed") {
      logger.warn("push gönderilemedi", {
        tenantId: record.tenantId,
        userId,
        kind: record.kind,
        sent: result.sent,
        invalidated: result.invalidated,
      });
    }
  } catch (error) {
    logger.warn("push köprüsü hata", {
      tenantId: record.tenantId,
      kind: record.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function listNotificationsForUserDb(recipient: NotificationRecipient): Promise<Notification[]> {
  const { prisma } = await db();
  const rows = await prisma.notification.findMany({
    where: {
      tenantId: recipient.tenantId,
      OR: [
        ...(recipient.userId ? [{ targetUserId: recipient.userId }] : []),
        ...(recipient.studentId ? [{ targetStudentId: recipient.studentId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublicNotification(mapDbNotification(r)));
}

/** Yalnızca hedeflenen kullanıcı/öğrenciye ait bildirimler — cross-user sızıntı yok. */
export async function listNotificationsForUser(
  recipient: NotificationRecipient
): Promise<Notification[]> {
  if (!recipient.userId && !recipient.studentId) return [];
  if (isDbMode) return listNotificationsForUserDb(recipient);
  const all = await loadAll();
  return all
    .filter(
      (n) =>
        n.tenantId === recipient.tenantId &&
        ((recipient.userId && n.targetUserId === recipient.userId) ||
          (recipient.studentId && n.targetStudentId === recipient.studentId))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map(toPublicNotification);
}

/** cursor := base64(JSON {createdAt,id}) of the last item seen on the previous page. */
function encodeCursor(n: Notification): string {
  return Buffer.from(JSON.stringify({ createdAt: n.createdAt, id: n.id })).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    if (typeof parsed?.createdAt === "string" && typeof parsed?.id === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

const DEFAULT_NOTIFICATIONS_PAGE_SIZE = 20;

export type ListNotificationsPage = {
  notifications: Notification[];
  nextCursor: string | null;
  unreadCount: number;
};

/**
 * Sayfalı bildirim listesi — createdAt+id bileşik sıralamasıyla kararlı (aynı createdAt'te
 * tekrar/eksik satır olmaz). cursor/limit verilmezse ilk sayfayı döner (eski çağıranlarla uyumlu).
 */
export async function listNotificationsPageForUser(
  recipient: NotificationRecipient,
  page?: { cursor?: string; limit?: number }
): Promise<ListNotificationsPage> {
  if (isDbMode) return listNotificationsPageForUserDb(recipient, page);
  const all = await listNotificationsForUser(recipient);
  const unreadCount = all.filter((n) => !n.readAt).length;

  let rows = all;
  if (page?.cursor) {
    const decoded = decodeCursor(page.cursor);
    if (!decoded) return { notifications: [], nextCursor: null, unreadCount };
    rows = all.filter(
      (n) =>
        n.createdAt < decoded.createdAt ||
        (n.createdAt === decoded.createdAt && n.id < decoded.id)
    );
  }

  const limit = page?.limit ?? DEFAULT_NOTIFICATIONS_PAGE_SIZE;
  const pageRows = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? encodeCursor(pageRows[pageRows.length - 1]) : null;

  return { notifications: pageRows, nextCursor, unreadCount };
}

/**
 * DB egress (2026-09-30) — zil her açılış/odakta kullanıcının TÜM bildirimlerini (testte ~600 satır)
 * okuyup bellekte sayfalıyordu. Aynı sözleşme SQL'de: okunmamış sayısı `count`, sayfa
 * `createdAt desc, id desc` + `take: limit + 1` (fazla satır = sonraki sayfa var). İmleç
 * karşılaştırması json koluyla aynı bileşik sıralamadır.
 */
async function listNotificationsPageForUserDb(
  recipient: NotificationRecipient,
  page?: { cursor?: string; limit?: number }
): Promise<ListNotificationsPage> {
  if (!recipient.userId && !recipient.studentId) return { notifications: [], nextCursor: null, unreadCount: 0 };
  const { prisma } = await db();
  const where = {
    tenantId: recipient.tenantId,
    OR: [
      ...(recipient.userId ? [{ targetUserId: recipient.userId }] : []),
      ...(recipient.studentId ? [{ targetStudentId: recipient.studentId }] : []),
    ],
  };
  const decoded = page?.cursor ? decodeCursor(page.cursor) : null;
  const limit = page?.limit ?? DEFAULT_NOTIFICATIONS_PAGE_SIZE;
  const unreadCountQuery = prisma.notification.count({ where: { ...where, readAt: null } });
  if (page?.cursor && !decoded) return { notifications: [], nextCursor: null, unreadCount: await unreadCountQuery };
  const after = decoded
    ? {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ],
      }
    : {};
  const [unreadCount, rows] = await Promise.all([
    unreadCountQuery,
    prisma.notification.findMany({
      where: { AND: [where, after] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
  ]);
  const mapped = rows.map((r) => toPublicNotification(mapDbNotification(r)));
  const pageRows = mapped.slice(0, limit);
  const nextCursor = mapped.length > limit ? encodeCursor(pageRows[pageRows.length - 1]) : null;
  return { notifications: pageRows, nextCursor, unreadCount };
}

async function markNotificationReadDb(
  recipient: NotificationRecipient,
  notificationId: string
): Promise<Notification | null> {
  const { prisma } = await db();
  const existing = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      tenantId: recipient.tenantId,
      OR: [
        ...(recipient.userId ? [{ targetUserId: recipient.userId }] : []),
        ...(recipient.studentId ? [{ targetStudentId: recipient.studentId }] : []),
      ],
    },
  });
  if (!existing) return null;
  const row = await prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: new Date() },
  });
  return toPublicNotification(mapDbNotification(row));
}

/**
 * Yalnızca kendi bildirimini okundu işaretleyebilir — recipient
 * eşleşmiyorsa (başka kullanıcının bildirimi) null döner, sessizce
 * başarısız olmaz: çağıran NOT_FOUND'a çevirmeli.
 */
export async function markNotificationRead(
  recipient: NotificationRecipient,
  notificationId: string
): Promise<Notification | null> {
  if (!recipient.userId && !recipient.studentId) return null;
  if (isDbMode) return markNotificationReadDb(recipient, notificationId);
  return mutateAllUnderLock((all) => {
    const idx = all.findIndex(
      (n) =>
        n.id === notificationId &&
        n.tenantId === recipient.tenantId &&
        ((recipient.userId && n.targetUserId === recipient.userId) ||
          (recipient.studentId && n.targetStudentId === recipient.studentId))
    );
    if (idx === -1) return { next: null, result: null };
    const updated: StoredNotification = { ...all[idx], readAt: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    return { next, result: toPublicNotification(updated) };
  });
}

async function listAllNotificationsDb(tenantId: string): Promise<Notification[]> {
  const { prisma } = await db();
  const rows = await prisma.notification.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublicNotification(mapDbNotification(r)));
}

/** EPIC 0/12 (IMPLEMENTATION_PLAN.md son adım) — kurum dışa aktarımı içindir. */
export async function listAllNotifications(tenantId: string): Promise<Notification[]> {
  if (isDbMode) return listAllNotificationsDb(tenantId);
  const all = await loadAll();
  return all
    .filter((n) => n.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicNotification);
}

async function clearNotificationsDb(tenantId: string): Promise<void> {
  const { prisma } = await db();
  await prisma.notification.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm bildirimlerini siler. */
export async function clearNotifications(tenantId: string): Promise<void> {
  if (isDbMode) return clearNotificationsDb(tenantId);
  await mutateAllUnderLock((all) => {
    const remaining = all.filter((n) => n.tenantId !== tenantId);
    return { next: remaining.length !== all.length ? remaining : null, result: undefined };
  });
}
