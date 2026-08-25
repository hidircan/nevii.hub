/**
 * EPIC 5 (IMPLEMENTATION_PLAN.md) — duyuru merkezi store katmanı.
 * STORE_MODE=db  → Prisma Announcement/AnnouncementRead (kalıcı, production)
 * STORE_MODE=json/memory → dosya tabanlı store (demo)
 * Aynı desen: src/lib/notifications/index.ts, src/lib/tahsilat/cases.ts.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import type {
  Announcement as DbAnnouncement,
  AnnouncementRead as DbAnnouncementRead,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import type {
  Announcement,
  AnnouncementAudienceRef,
  AnnouncementAudienceType,
  AnnouncementStatus,
  AudienceRule,
  Student,
  Teacher,
} from "../types";
import type { AnnouncementRecipient } from "./audience";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "announcements.json");
const READS_FILE = path.join(
  resolveDataDir(path.join(process.cwd(), "data")),
  "announcement-reads.json"
);

/** Resolved store paths — exposed so tests clean up the same files this module writes. */
export const ANNOUNCEMENTS_FILE = FILE;
export const ANNOUNCEMENT_READS_FILE = READS_FILE;

type StoredAnnouncement = Announcement & { tenantId: string };
type StoredRead = { id: string; tenantId: string; announcementId: string; userId: string; readAt: string };

async function loadAll(): Promise<StoredAnnouncement[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredAnnouncement[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredAnnouncement[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

async function loadAllReads(): Promise<StoredRead[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(READS_FILE, "utf8");
    return JSON.parse(raw) as StoredRead[];
  } catch {
    return [];
  }
}

async function saveAllReads(rows: StoredRead[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(READS_FILE), { recursive: true });
  await fs.writeFile(READS_FILE, JSON.stringify(rows, null, 2));
}

function toIso(date: Date | null): string | undefined {
  return date ? date.toISOString() : undefined;
}

function isAnnouncementAttachmentArray(v: unknown): v is Announcement["attachments"] {
  if (!Array.isArray(v)) return false;
  return v.every((it) => {
    if (typeof it !== "object" || it === null) return false;
    const r = it as Record<string, unknown>;
    return (
      typeof r.id === "string" &&
      typeof r.fileName === "string" &&
      typeof r.mimeType === "string" &&
      typeof r.sizeBytes === "number" &&
      typeof r.storageKey === "string" &&
      typeof r.uploadedAt === "string"
    );
  });
}

function isAudienceRuleArray(v: unknown): v is AudienceRule[] {
  if (!Array.isArray(v)) return false;
  return v.every((it) => typeof it === "object" && it !== null && typeof (it as { audienceType?: unknown }).audienceType === "string");
}

function mapDbAnnouncement(a: DbAnnouncement): StoredAnnouncement {
  const attachmentsRaw: unknown = a.attachments;
  const attachments = isAnnouncementAttachmentArray(attachmentsRaw) ? attachmentsRaw : undefined;
  const rulesRaw: unknown = a.rules;
  return {
    id: a.id,
    tenantId: a.tenantId,
    title: a.title,
    body: a.body,
    attachmentUrl: a.attachmentUrl ?? undefined,
    attachments: Array.isArray(attachments) ? attachments : undefined,
    audienceType: a.audienceType as AnnouncementAudienceType,
    audienceRef: (a.audienceRef as AnnouncementAudienceRef | null) ?? undefined,
    rules: isAudienceRuleArray(rulesRaw) ? rulesRaw : undefined,
    status: a.status as AnnouncementStatus,
    pinned: a.pinned,
    publishAt: toIso(a.publishAt),
    expireAt: toIso(a.expireAt),
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    recipientCount: a.recipientCount ?? undefined,
  };
}

function toPublicAttachments(attachments: Announcement["attachments"]): Announcement["attachments"] {
  if (!attachments?.length) return undefined;
  return attachments.map(({ id, fileName, mimeType, sizeBytes, uploadedAt }) => ({
    id,
    fileName,
    mimeType,
    sizeBytes,
    uploadedAt,
  }));
}

function toPublicAnnouncement(a: StoredAnnouncement): Announcement {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    attachmentUrl: a.attachmentUrl,
    attachments: toPublicAttachments(a.attachments),
    audienceType: a.audienceType,
    audienceRef: a.audienceRef,
    rules: a.rules,
    status: a.status,
    pinned: a.pinned,
    publishAt: a.publishAt,
    expireAt: a.expireAt,
    createdBy: a.createdBy,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    recipientCount: a.recipientCount,
  };
}

export type CreateAnnouncementInput = {
  tenantId: string;
  title: string;
  body: string;
  attachmentUrl?: string;
  attachments?: Announcement["attachments"];
  audienceType: AnnouncementAudienceType;
  audienceRef?: AnnouncementAudienceRef;
  rules?: AudienceRule[];
  status?: AnnouncementStatus;
  pinned?: boolean;
  publishAt?: string;
  expireAt?: string;
  createdBy: string;
};

async function createAnnouncementDb(input: CreateAnnouncementInput): Promise<Announcement> {
  const { prisma } = await import("../db");
  const row = await prisma.announcement.create({
    data: {
      id: uid("ann"),
      tenantId: input.tenantId,
      title: input.title,
      body: input.body,
      attachmentUrl: input.attachmentUrl ?? null,
      // Prisma Json fields accept JsonValue — safely cast unknown -> JsonValue
      attachments:
        input.attachments === undefined
          ? undefined
          : input.attachments === null
          ? Prisma.JsonNull
          : (input.attachments as unknown as Prisma.InputJsonValue),
      audienceType: input.audienceType,
      audienceRef:
        input.audienceRef === undefined
          ? undefined
          : input.audienceRef === null
          ? Prisma.JsonNull
          : (input.audienceRef as unknown as Prisma.InputJsonValue),
      rules:
        input.rules === undefined
          ? undefined
          : (input.rules as unknown as Prisma.InputJsonValue),
      status: input.status ?? "draft",
      pinned: input.pinned ?? false,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      expireAt: input.expireAt ? new Date(input.expireAt) : null,
      createdBy: input.createdBy,
    },
  });
  return toPublicAnnouncement(mapDbAnnouncement(row));
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  if (isDbMode) return createAnnouncementDb(input);
  const all = await loadAll();
  const now = new Date().toISOString();
  const record: StoredAnnouncement = {
    id: uid("ann"),
    tenantId: input.tenantId,
    title: input.title,
    body: input.body,
    attachmentUrl: input.attachmentUrl,
    attachments: input.attachments,
    audienceType: input.audienceType,
    audienceRef: input.audienceRef,
    rules: input.rules,
    status: input.status ?? "draft",
    pinned: input.pinned ?? false,
    publishAt: input.publishAt,
    expireAt: input.expireAt,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await saveAll([...all, record]);
  return toPublicAnnouncement(record);
}

async function listAnnouncementsDb(tenantId: string): Promise<Announcement[]> {
  const { prisma } = await import("../db");
  const rows = await prisma.announcement.findMany({
    where: { tenantId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => toPublicAnnouncement(mapDbAnnouncement(r)));
}

/** Sunucu içi: `storageKey` dahil. Client'a asla doğrudan dönme. */
export async function getStoredAnnouncement(
  tenantId: string,
  id: string
): Promise<StoredAnnouncement | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const row = await prisma.announcement.findFirst({ where: { id, tenantId } });
    return row ? mapDbAnnouncement(row) : null;
  }
  const all = await loadAll();
  return all.find((a) => a.id === id && a.tenantId === tenantId) ?? null;
}

/** Tüm duyurular (durum fark etmeksizin) — yönetim ekranı içindir. */
export async function listAnnouncements(tenantId: string): Promise<Announcement[]> {
  if (isDbMode) return listAnnouncementsDb(tenantId);
  const all = await loadAll();
  return all
    .filter((a) => a.tenantId === tenantId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map(toPublicAnnouncement);
}

async function updateAnnouncementStatusDb(
  tenantId: string,
  id: string,
  status: AnnouncementStatus
): Promise<Announcement | null> {
  const { prisma } = await import("../db");
  const result = await prisma.announcement.updateMany({
    where: { id, tenantId },
    data: { status },
  });
  if (result.count === 0) return null;
  const row = await prisma.announcement.findFirst({ where: { id, tenantId } });
  return row ? toPublicAnnouncement(mapDbAnnouncement(row)) : null;
}

export async function updateAnnouncementStatus(
  tenantId: string,
  id: string,
  status: AnnouncementStatus
): Promise<Announcement | null> {
  if (isDbMode) return updateAnnouncementStatusDb(tenantId, id, status);
  const all = await loadAll();
  const idx = all.findIndex((a) => a.id === id && a.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredAnnouncement = { ...all[idx], status, updatedAt: new Date().toISOString() };
  const next = [...all];
  next[idx] = updated;
  await saveAll(next);
  return toPublicAnnouncement(updated);
}

async function markAnnouncementReadDb(
  tenantId: string,
  announcementId: string,
  userId: string
): Promise<void> {
  const { prisma } = await import("../db");
  const existing = await prisma.announcement.findFirst({ where: { id: announcementId, tenantId } });
  if (!existing) return;
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { id: uid("annread"), announcementId, userId },
    update: {},
  });
}

/** Idempotent — aynı kullanıcı tekrar okundu işaretlerse yeni kayıt oluşmaz. */
export async function markAnnouncementRead(
  tenantId: string,
  announcementId: string,
  userId: string
): Promise<void> {
  if (isDbMode) return markAnnouncementReadDb(tenantId, announcementId, userId);
  const announcements = await loadAll();
  if (!announcements.some((a) => a.id === announcementId && a.tenantId === tenantId)) return;
  const reads = await loadAllReads();
  if (reads.some((r) => r.announcementId === announcementId && r.userId === userId)) return;
  await saveAllReads([
    ...reads,
    {
      id: uid("annread"),
      tenantId,
      announcementId,
      userId,
      readAt: new Date().toISOString(),
    },
  ]);
}

async function listReadUserIdsDb(tenantId: string, announcementId: string): Promise<string[]> {
  const { prisma } = await import("../db");
  const existing = await prisma.announcement.findFirst({ where: { id: announcementId, tenantId } });
  if (!existing) return [];
  const rows: DbAnnouncementRead[] = await prisma.announcementRead.findMany({
    where: { announcementId },
  });
  return rows.map((r) => r.userId);
}

/** Yönetim ekranı "okunma durumu" tablosu için — yalnızca aynı tenant'ın duyurusuysa döner. */
export async function listReadUserIds(tenantId: string, announcementId: string): Promise<string[]> {
  if (isDbMode) return listReadUserIdsDb(tenantId, announcementId);
  const announcements = await loadAll();
  if (!announcements.some((a) => a.id === announcementId && a.tenantId === tenantId)) return [];
  const reads = await loadAllReads();
  return reads.filter((r) => r.announcementId === announcementId).map((r) => r.userId);
}

async function clearAnnouncementsDb(tenantId: string): Promise<void> {
  const { prisma } = await import("../db");
  await prisma.announcement.deleteMany({ where: { tenantId } });
}

/** Demo reset için — tenant'ın tüm duyurularını (ve okuma kayıtlarını) siler. */
export async function clearAnnouncements(tenantId: string): Promise<void> {
  if (isDbMode) return clearAnnouncementsDb(tenantId);
  const all = await loadAll();
  const idsToRemove = new Set(all.filter((a) => a.tenantId === tenantId).map((a) => a.id));
  const remaining = all.filter((a) => a.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
  if (idsToRemove.size > 0) {
    const reads = await loadAllReads();
    const remainingReads = reads.filter((r) => !idsToRemove.has(r.announcementId));
    if (remainingReads.length !== reads.length) await saveAllReads(remainingReads);
  }
}

async function setAnnouncementRecipientCountDb(tenantId: string, id: string, count: number): Promise<void> {
  const { prisma } = await import("../db");
  await prisma.announcement.updateMany({ where: { id, tenantId }, data: { recipientCount: count } });
}

/** Faz 4 — yayınlama anında çözülen benzersiz alıcı sayısını kalıcılaştırır. */
export async function setAnnouncementRecipientCount(tenantId: string, id: string, count: number): Promise<void> {
  if (isDbMode) return setAnnouncementRecipientCountDb(tenantId, id, count);
  const all = await loadAll();
  const idx = all.findIndex((a) => a.id === id && a.tenantId === tenantId);
  if (idx === -1) return;
  const next = [...all];
  next[idx] = { ...next[idx], recipientCount: count, updatedAt: new Date().toISOString() };
  await saveAll(next);
}

/**
 * Faz 4 — duyuru yayınlandığında PUSH gönderilecek gerçek kullanıcı
 * hesaplarının adayı (I/O burada yapılır; `audience.ts` saf kalır).
 * Her aktif öğretmen için tek aday, her aktif StudentPortalAccess kaydı
 * (SELF veya GUARDIAN, öğrenci başına) için tek aday — bir veli birden
 * fazla öğrenciye bağlıysa aynı userId birden fazla aday satırında
 * görünebilir; nihai tekilleştirme `resolveAudienceRecipients`de olur.
 */
export async function buildAnnouncementRecipientCandidates(
  tenantId: string,
  teachers: Teacher[],
  students: Student[]
): Promise<AnnouncementRecipient[]> {
  const { getUserIdByTeacherId } = await import("../auth/users");
  const { listActiveAccessForTenant } = await import("../student-portal-access");

  const candidates: AnnouncementRecipient[] = [];

  const activeTeachers = teachers.filter((t) => t.active);
  const teacherUserIds = await Promise.all(activeTeachers.map((t) => getUserIdByTeacherId(tenantId, t.id)));
  activeTeachers.forEach((t, i) => {
    const userId = teacherUserIds[i];
    if (userId) candidates.push({ role: "TEACHER", userId, teacherId: t.id });
  });

  const activeStudentIds = new Set(students.filter((s) => s.active).map((s) => s.id));
  const access = await listActiveAccessForTenant(tenantId);
  for (const a of access) {
    if (!activeStudentIds.has(a.studentId)) continue;
    candidates.push({ role: "STUDENT", userId: a.userId, studentId: a.studentId, accessType: a.accessType });
  }

  return candidates;
}
