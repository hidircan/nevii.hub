/**
 * EPIC 1 (IMPLEMENTATION_PLAN.md) — uygulama içi bildirimler.
 * STORE_MODE=db  → Prisma Notification (kalıcı, production)
 * STORE_MODE=json/memory → dosya tabanlı store (demo)
 * Erişim her zaman tenantId + (targetUserId veya targetStudentId) ile
 * kapsamlanır — bkz. listNotificationsForUser.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
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
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
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
};

/** targetUserId'ye VEYA targetStudentId'ye göre — tenant içinde kişiye özel bildirimler. */
export type NotificationRecipient = {
  tenantId: string;
  userId?: string;
  studentId?: string;
};

async function createNotificationDb(input: CreateNotificationInput): Promise<Notification> {
  const { prisma } = await import("../db");
  const row = await prisma.notification.create({
    data: {
      id: uid("notif"),
      tenantId: input.tenantId,
      targetUserId: input.targetUserId ?? null,
      targetStudentId: input.targetStudentId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body,
    },
  });
  return toPublicNotification(mapDbNotification(row));
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  if (isDbMode) return createNotificationDb(input);
  const all = await loadAll();
  const record: StoredNotification = {
    id: uid("notif"),
    tenantId: input.tenantId,
    targetUserId: input.targetUserId,
    targetStudentId: input.targetStudentId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
  };
  await saveAll([...all, record]);
  return toPublicNotification(record);
}

async function listNotificationsForUserDb(recipient: NotificationRecipient): Promise<Notification[]> {
  const { prisma } = await import("../db");
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

async function markNotificationReadDb(
  recipient: NotificationRecipient,
  notificationId: string
): Promise<Notification | null> {
  const { prisma } = await import("../db");
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
  const all = await loadAll();
  const idx = all.findIndex(
    (n) =>
      n.id === notificationId &&
      n.tenantId === recipient.tenantId &&
      ((recipient.userId && n.targetUserId === recipient.userId) ||
        (recipient.studentId && n.targetStudentId === recipient.studentId))
  );
  if (idx === -1) return null;
  const updated: StoredNotification = { ...all[idx], readAt: new Date().toISOString() };
  const next = [...all];
  next[idx] = updated;
  await saveAll(next);
  return toPublicNotification(updated);
}

async function listAllNotificationsDb(tenantId: string): Promise<Notification[]> {
  const { prisma } = await import("../db");
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
  const { prisma } = await import("../db");
  await prisma.notification.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm bildirimlerini siler. */
export async function clearNotifications(tenantId: string): Promise<void> {
  if (isDbMode) return clearNotificationsDb(tenantId);
  const all = await loadAll();
  const remaining = all.filter((n) => n.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}
