/**
 * Öğrenci/öğretmen/kullanıcı profil fotoğrafı deposu — Homework/DocumentInstance
 * ile AYNI desen: liste görünümleri yalnızca meta (var mı/ne zaman güncellendi)
 * alır, ham `fileData` yalnızca yetkili tek-kayıt istekleriyle (bkz.
 * getProfilePhotoTool + fotoğraf serve route'u) döner. STORE_MODE=db → Prisma
 * ProfilePhoto, json/memory → dosya tabanlı (diğer store modülleriyle AYNI
 * ikili desen, bkz. src/lib/student-portal-access.ts).
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

/** "user" — Student/Teacher gibi ayrı bir domain kaydı olmayan roller (veli, admin) kendi User.id'siyle sahiplenir. */
export type ProfilePhotoOwnerType = "student" | "teacher" | "user";

export type ProfilePhoto = {
  id: string;
  tenantId: string;
  ownerType: ProfilePhotoOwnerType;
  ownerId: string;
  fileMimeType: string;
  fileData: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfilePhotoMeta = Pick<ProfilePhoto, "ownerType" | "ownerId" | "updatedAt">;

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "profile-photos.json");
export const PROFILE_PHOTOS_FILE = FILE;

async function loadAll(): Promise<ProfilePhoto[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as ProfilePhoto[];
  } catch {
    return [];
  }
}

async function saveAll(rows: ProfilePhoto[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function mapDb(row: {
  id: string;
  tenantId: string;
  ownerType: string;
  ownerId: string;
  fileMimeType: string;
  fileData: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}): ProfilePhoto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ownerType: row.ownerType as ProfilePhotoOwnerType,
    ownerId: row.ownerId,
    fileMimeType: row.fileMimeType,
    fileData: row.fileData,
    fileSize: row.fileSize,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertProfilePhotoInput = {
  tenantId: string;
  ownerType: ProfilePhotoOwnerType;
  ownerId: string;
  fileMimeType: string;
  fileData: string;
  fileSize: number;
  uploadedBy: string;
};

/** Var olanı DEĞİŞTİRİR (bir sahibin her zaman en fazla bir fotoğrafı olur) — "değiştir" akışı ayrı bir silme gerektirmez. */
export async function upsertProfilePhoto(input: UpsertProfilePhotoInput): Promise<ProfilePhoto> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.profilePhoto.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId: input.tenantId, ownerType: input.ownerType, ownerId: input.ownerId } },
      create: {
        id: uid("photo"),
        tenantId: input.tenantId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        fileMimeType: input.fileMimeType,
        fileData: input.fileData,
        fileSize: input.fileSize,
        uploadedBy: input.uploadedBy,
      },
      update: {
        fileMimeType: input.fileMimeType,
        fileData: input.fileData,
        fileSize: input.fileSize,
        uploadedBy: input.uploadedBy,
      },
    });
    return mapDb(row);
  }

  const all = await loadAll();
  const now = new Date().toISOString();
  const existingIdx = all.findIndex(
    (p) => p.tenantId === input.tenantId && p.ownerType === input.ownerType && p.ownerId === input.ownerId
  );
  if (existingIdx >= 0) {
    const updated: ProfilePhoto = {
      ...all[existingIdx]!,
      fileMimeType: input.fileMimeType,
      fileData: input.fileData,
      fileSize: input.fileSize,
      uploadedBy: input.uploadedBy,
      updatedAt: now,
    };
    const next = [...all];
    next[existingIdx] = updated;
    await saveAll(next);
    return updated;
  }
  const record: ProfilePhoto = {
    id: uid("photo"),
    tenantId: input.tenantId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    fileMimeType: input.fileMimeType,
    fileData: input.fileData,
    fileSize: input.fileSize,
    uploadedBy: input.uploadedBy,
    createdAt: now,
    updatedAt: now,
  };
  await saveAll([...all, record]);
  return record;
}

export async function getProfilePhoto(
  tenantId: string,
  ownerType: ProfilePhotoOwnerType,
  ownerId: string
): Promise<ProfilePhoto | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.profilePhoto.findUnique({
      where: { tenantId_ownerType_ownerId: { tenantId, ownerType, ownerId } },
    });
    return row ? mapDb(row) : null;
  }
  const all = await loadAll();
  return all.find((p) => p.tenantId === tenantId && p.ownerType === ownerType && p.ownerId === ownerId) ?? null;
}

/** "Sıfırla" — satırı tamamen kaldırır, Avatar bileşeni otomatik olarak baş harf fallback'ine döner. */
export async function deleteProfilePhoto(
  tenantId: string,
  ownerType: ProfilePhotoOwnerType,
  ownerId: string
): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.profilePhoto.deleteMany({ where: { tenantId, ownerType, ownerId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((p) => !(p.tenantId === tenantId && p.ownerType === ownerType && p.ownerId === ownerId));
  if (remaining.length !== all.length) await saveAll(remaining);
}

/**
 * Toplu meta — liste ekranlarının (öğretmenin öğrenci listesi vb.) her satır
 * için ayrı sorgu atmadan "fotoğrafı var mı" bilgisini alması için. Ham
 * `fileData` YOK — bkz. modül başı açıklama.
 */
export async function listProfilePhotoMeta(
  tenantId: string,
  ownerType: ProfilePhotoOwnerType,
  ownerIds: string[]
): Promise<Map<string, ProfilePhotoMeta>> {
  if (ownerIds.length === 0) return new Map();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.profilePhoto.findMany({
      where: { tenantId, ownerType, ownerId: { in: ownerIds } },
      select: { ownerType: true, ownerId: true, updatedAt: true },
    });
    return new Map(
      rows.map((r) => [r.ownerId, { ownerType: r.ownerType as ProfilePhotoOwnerType, ownerId: r.ownerId, updatedAt: r.updatedAt.toISOString() }])
    );
  }
  const all = await loadAll();
  const idSet = new Set(ownerIds);
  const map = new Map<string, ProfilePhotoMeta>();
  for (const p of all) {
    if (p.tenantId === tenantId && p.ownerType === ownerType && idSet.has(p.ownerId)) {
      map.set(p.ownerId, { ownerType: p.ownerType, ownerId: p.ownerId, updatedAt: p.updatedAt });
    }
  }
  return map;
}

/** Demo/kurulum sıfırlaması + testler için. */
export async function clearProfilePhotos(tenantId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.profilePhoto.deleteMany({ where: { tenantId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((p) => p.tenantId !== tenantId);
  if (remaining.length !== all.length) await saveAll(remaining);
}
